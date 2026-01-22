# Problem Examples

## Example 1: Code Looks Good, Architecture is Crap

```tsx
// UserProfile.tsx - looks clean!
export function UserProfile({ user }: { user: User }) {
  return (
    <Card>
      <Avatar src={user.avatar} />
      <Name>{user.displayName}</Name>
      <UserStats userId={user.id} />
    </Card>
  );
}

// UserStats.tsx - also looks clean!
export function UserStats({ userId }: { userId: string }) {
  const stats = useUserStats(userId);
  return <StatsDisplay stats={stats} />;
}
```

**What the LLM sees**: Two clean components with clear props.

**Why the LLM doesn't look deeper**: The line `<StatsDisplay stats={stats} />` looks innocuous. `stats={stats}` - okay, we're passing stats to a display component. Seems fine. The LLM doesn't open `useUserStats` because why would it? The code looks reasonable.

**But if we looked at useUserStats.ts**:

```tsx
// useUserStats.ts
export function useUserStats(userId: string) {
  return useQuery(['user-stats', userId], () => 
    fetch(`/api/users/${userId}/stats`).then(r => r.json())
  );
  // Returns: { postsCount: number, followersCount: number, followingCount: number }
}
```

**And if we looked at the User type**:

```tsx
// types/User.ts
interface User {
  id: string;
  displayName: string;
  avatar: string;
  postsCount: number;      // ← IT'S ALREADY HERE
  followersCount: number;  // ← IT'S ALREADY HERE  
  followingCount: number;  // ← IT'S ALREADY HERE
}
```

**The actual problem**: `useUserStats` fetches `{ postsCount, followersCount, followingCount }` - data that's ALREADY on the `User` object that `UserProfile` has! The parent had everything, passed only `userId`, and the child made a redundant API call to get data that was right there.

This pattern is repeated across 15 components, causing N+1 query problems throughout the app. One page loads 8 copies of the same user's stats.

**What we need to surface**:
- "useUserStats fetches { postsCount, followersCount, followingCount }"
- "User object already contains postsCount, followersCount, followingCount"
- "UserStats receives userId but parent has full User with this data"
- "Consider: `<UserStats stats={user} />` instead of re-fetching"

---

## Example 2: Architecture Looks Good, Implementation is Wasteful

```tsx
// Reasonable-looking component hierarchy:
// ProductPage → ProductDetails → PriceDisplay → FormattedPrice

// The API returns a clean object:
interface Product {
  id: string;
  name: string;
  price: { amount: number; currency: string };
  discount?: { percent: number; expiresAt: Date };
}

// ProductPage.tsx - destructures the price object
function ProductPage({ product }: { product: Product }) {
  const { amount, currency } = product.price;
  const discountInfo = product.discount 
    ? formatDiscount(product.discount)  // helper that renames fields
    : null;
  
  return (
    <ProductDetails 
      productId={product.id}
      productName={product.name}
      productPrice={amount}           // price.amount → productPrice
      productCurrency={currency}       // price.currency → productCurrency
      discountPercent={discountInfo?.pct}      // discount.percent → pct → discountPercent
      discountExpiry={discountInfo?.expires}   // discount.expiresAt → expires → discountExpiry
    />
  );
}

// utils/formatDiscount.ts - exists only to rename fields
function formatDiscount(discount: { percent: number; expiresAt: Date }) {
  return {
    pct: discount.percent,      // percent → pct (WHY?)
    expires: discount.expiresAt // expiresAt → expires (WHY?)
  };
}

// ProductDetails.tsx - receives flat props, reconstructs an object
function ProductDetails({ 
  productPrice, 
  productCurrency,
  discountPercent,
  discountExpiry 
}: ProductDetailsProps) {
  
  // Reconstructs a price object that was JUST destructured in the parent
  const priceData = {
    value: productPrice,        // productPrice → value
    curr: productCurrency       // productCurrency → curr
  };
  
  return (
    <PriceDisplay
      priceInfo={priceData}
      discountPct={discountPercent}    // discountPercent → discountPct
      discountEndsAt={discountExpiry}  // discountExpiry → discountEndsAt
    />
  );
}

// PriceDisplay.tsx - destructures AGAIN, renames AGAIN
function PriceDisplay({ 
  priceInfo, 
  discountPct, 
  discountEndsAt 
}: PriceDisplayProps) {
  const { value, curr } = priceInfo;
  
  return (
    <FormattedPrice
      amount={value}                    // value → amount (BACK to original name!)
      currencyCode={curr}               // curr → currencyCode
      discount={discountPct}            // discountPct → discount
      discountEnds={discountEndsAt}     // discountEndsAt → discountEnds
    />
  );
}

// FormattedPrice.tsx - finally uses the data
function FormattedPrice({ amount, currencyCode, discount, discountEnds }) {
  // Formats and displays. This is the only component that DOES anything.
}
```

**What the LLM sees**: Each component has clear props, types look reasonable, there are helper functions.

**What the LLM misses**: 

The journey of `product.price.amount`:
1. `product.price.amount` (API response)
2. → destructured to `amount` (ProductPage)
3. → passed as `productPrice` (prop to ProductDetails)  
4. → put into object as `value` (ProductDetails reconstructs object)
5. → destructured to `value` (PriceDisplay)
6. → passed as `amount` (prop to FormattedPrice) ← **BACK TO THE ORIGINAL NAME**

**SIX transformations. Zero computation. The value is LITERALLY the same number.**

And there's a `formatDiscount()` helper function that exists purely to rename `percent` → `pct` and `expiresAt` → `expires`. It does no computation. It's just a renaming function that someone wrote because they didn't want to use the original field names.

**The entire chain could be**:
```tsx
<FormattedPrice product={product} />
```

**What we need to surface**:
- "product.price.amount is renamed 6 times, ends up as 'amount' (same as start)"
- "formatDiscount() performs no computation, only renames fields"
- "ProductDetails reconstructs { value, curr } object that parent just destructured from { amount, currency }"
- "4 components, only 1 does actual work (FormattedPrice)"
- "Consider: pass product object directly, let leaf component extract what it needs"

---

## Example 3: Lazy Adaptor Creates Naming Pollution

An LLM is asked to connect `CheckoutForm` to a new `PaymentProcessor`:

```tsx
// PaymentProcessor expects:
interface PaymentInput {
  totalAmount: number;
  currencyCode: string;
}

// CheckoutForm has:
const { finalPrice, currency } = useCart();

// LLM is lazy, doesn't want to refactor, creates adaptor:
const paymentInput: PaymentInput = {
  totalAmount: finalPrice,  // finalPrice → totalAmount
  currencyCode: currency,   // currency → currencyCode
};
```

**What the LLM should have done**: Open `useCart` and see that `finalPrice` should probably be called `totalAmount` everywhere, and `currency` should be `currencyCode` for consistency.

**What actually happens**: Now the codebase has both names. The next LLM (or developer) sees both conventions, picks one randomly, and the pollution spreads.

**What we need to surface**:
- "Same concept has 3 different names: finalPrice, totalAmount, price"
- "Adaptor created to rename props - consider unifying naming at source"
- "useCart.currency vs PaymentInput.currencyCode - naming inconsistency"

---

## Example 4: Feature Boundaries Become Shit Sandcastle

Junior dev needed to show if a product was discounted. Quick solution: stuff it into the existing `ProductImage` component since "it already has product info":

```tsx
// ProductImage.tsx - started as image display
interface ProductImageProps {
  src: string;
  alt: string;
  // ...then this got added
  hasDiscount?: boolean;
  discountBadgePosition?: 'top-left' | 'top-right';
  discountText?: string;
  // ...then this
  isNewArrival?: boolean;
  newArrivalBadgeColor?: string;
  // ...then this  
  stockLevel?: 'in-stock' | 'low' | 'out';
  showStockIndicator?: boolean;
}
```

**What the LLM sees**: A component with lots of props (looks flexible!).

**What the LLM misses**: This is a franken-component. Image display, discount badges, new arrival indicators, and stock levels are FOUR separate concerns jammed into one component because it was convenient at the time. Now every change to discount display risks breaking image rendering.

**What we need to surface**:
- "ProductImage has 4 unrelated feature concerns"
- "Discount, stock, and arrival props have no relationship to image display"
- "Consider extracting: DiscountBadge, StockIndicator, NewArrivalBadge"
- "Feature boundary violation: pricing logic in display component"

---

## Example 5: Not Looking Up - Missing Usage Context

An LLM is asked to work on `SpecimenCard`. It opens the file, sees a clean component:

```tsx
// SpecimenCard.tsx
interface SpecimenCardProps {
  specimen: Specimen;
  onSelect?: (id: string) => void;
  showPrice?: boolean;
  isEditable?: boolean;
}

export function SpecimenCard({ specimen, onSelect, showPrice, isEditable }: SpecimenCardProps) {
  return (
    <Card onClick={() => onSelect?.(specimen.id)}>
      <SpecimenImage src={specimen.imageUrl} />
      <SpecimenDetails specimen={specimen} />
      {showPrice && <PriceTag price={specimen.price} />}
      {isEditable && <EditButton specimenId={specimen.id} />}
    </Card>
  );
}
```

**What the LLM sees**: A flexible card component with optional features controlled by props.

**What the LLM doesn't see** - where this component is used:

```
SpecimenCard is imported by:
├── DealerInventoryGrid.tsx      → used in DealerInventoryPage, DealerDashboard
├── CollectionGallery.tsx        → used in PublicCollectionPage, CollectorProfilePage  
└── PrivateCollectionList.tsx    → used in MyCollectionPage, CollectionManagement, ImportReview

Total: 3 direct parents, 8 page contexts
```

**The contexts are VERY different**:
- **Dealer Inventory**: Shows wholesale prices, bulk selection, inventory status
- **Public Collection**: Shows retail prices, "contact dealer" button, no editing
- **Private Collection**: Shows acquisition cost, personal notes, full editing

**What actually happened before unification**: The codebase had THREE different card components:

```tsx
// These all existed doing 80% the same thing:
DealerSpecimenCard.tsx      // 340 lines
PublicSpecimenCard.tsx      // 285 lines  
PrivateSpecimenCard.tsx     // 310 lines

// With three different type definitions:
interface DealerSpecimen { ... }
interface PublicSpecimen { ... }
interface CollectorSpecimen { ... }
```

**Why this happened**: Each developer worked on their feature, opened their page component, needed a card. They didn't "look up" to see if a card already existed. They didn't search for similar components. They wrote a new one.

935 lines of code doing the same thing three different ways with three different type systems.

**The LLM perpetuates this** because when asked to "add a feature to the specimen card in dealer inventory," it opens `DealerSpecimenCard.tsx`, makes the change, and moves on. It doesn't think to check if there are other specimen cards that need the same change.

**What we need to surface**:
- "SpecimenCard is used in 8 different page contexts across 3 parent components"
- "Similar components exist: DealerSpecimenCard, PublicSpecimenCard, PrivateSpecimenCard"
- "These components share 80% of their code - consider unification"
- "Specimen types: DealerSpecimen, PublicSpecimen, CollectorSpecimen have 15 common fields"
- "When modifying SpecimenCard, consider impact on: [list of 8 pages]"

**The insight an LLM needs**: "Before you add this feature to one card, look UP to see where this card is used and ACROSS to see if there are similar cards. You might be about to create technical debt or miss an opportunity to consolidate."

