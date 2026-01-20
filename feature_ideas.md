# Feature Ideas & Roadmap

---

## Purpose and Goals

This tool exists to help **LLMs like Claude Opus 4.5 make good architectural and refactoring decisions**.

### The Core Problem

LLMs operating in code editors have a fundamental visibility problem:

1. **Partial File Views**: Models often see only 150 lines of a file, not the whole file
2. **Limited File Context**: Models read one or several files, but not the dozens that might be relevant
3. **No Big Picture**: Architecture involves seeing connections across many files and systems - understanding how they're connected reveals the constraints and problems of any particular implementation approach

This creates a dangerous pattern: **local optimization with global ignorance**.

- A model looks at a single file and says "the code is good" - but the architecture might be garbage
- A model looks at the architecture diagram and says "looks reasonable" - but the implementation might be doing absurd busywork
- A model doesn't want to open another file, so it creates an adaptor - now you have variable name pollution
- A model builds on top of a poorly delineated feature boundary because that's what was already there - shit sandcastle grows

### What We Need to Provide

For LLMs to make good decisions, they need:

1. **Cross-file visibility** - See how data flows through the entire component tree
2. **Prop lineage tracking** - Know where a prop originated and how it transformed
3. **Architectural smell detection** - Surface patterns that indicate structural problems
4. **Boundary clarity** - Show where feature boundaries should be vs where they actually are
5. **Naming consistency analysis** - Detect when the same concept has multiple names across files

---

## Examples of Problems We Need to Detect

### Example 1: Code Looks Good, Architecture is Crap

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

**What the LLM misses**: `UserStats` re-fetches user data that was ALREADY available in the parent. The parent had the full `User` object but only passed the `id`, forcing a redundant API call. This pattern is repeated across 15 components, causing N+1 query problems throughout the app.

**What we need to surface**:
- "UserStats fetches data that parent already has"
- "User data is fetched 8 times on this page"
- "Consider passing user.stats directly instead of re-fetching"

---

### Example 2: Architecture Looks Good, Implementation is Wasteful

```tsx
// Reasonable-looking component hierarchy:
// ProductPage → ProductDetails → PriceDisplay → FormattedPrice

// But look at the props...

// ProductPage.tsx
<ProductDetails 
  productId={product.id}
  productName={product.name}
  productPrice={product.price}
  productCurrency={product.currency}
  productDiscountPercent={product.discount?.percent}
  productDiscountExpiry={product.discount?.expiresAt}
/>

// ProductDetails.tsx  
<PriceDisplay
  price={productPrice}
  currency={productCurrency}
  discountPercent={productDiscountPercent}
  discountExpiry={productDiscountExpiry}
/>

// PriceDisplay.tsx
<FormattedPrice
  amount={price}
  currencyCode={currency}
  discount={discountPercent}
  discountEnds={discountExpiry}
/>
```

**What the LLM sees**: Clean component tree, each level has clear props.

**What the LLM misses**: 
- `product.price` becomes `productPrice` becomes `price` becomes `amount` - FOUR NAMES for ONE value
- Every intermediate component is just prop-forwarding with renames
- Zero computational benefit from this decomposition
- The entire chain could be `<FormattedPrice product={product} />` with the component extracting what it needs

**What we need to surface**:
- "Prop 'price' is renamed 4 times across component chain with no transformation"
- "ProductDetails passes through 6 props without using them"
- "Consider: pass 'product' object instead of destructuring at every level"

---

### Example 3: Lazy Adaptor Creates Naming Pollution

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

### Example 4: Feature Boundaries Become Shit Sandcastle

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

## LLM-Focused Features

### 1. **Prop Lineage Tracking**
**Problem**: LLMs can't see that `amount` in component D is the same value as `product.price` in component A, just renamed 4 times.

**Solution**: Track prop identity across the component tree:
- Show the origin of every prop (where it was first defined)
- Highlight props that are renamed without transformation
- Detect "pass-through" components that just forward props
- Calculate "prop distance" - how many renames between source and usage

**Output for LLM**: "The prop 'amount' in FormattedPrice originated as 'product.price' in ProductPage and was renamed 4 times (productPrice → price → amount) with no transformation."

### 2. **Data Fetch Duplication Detection**
**Problem**: LLMs see clean components but miss that the same data is being fetched multiple times.

**Solution**: Track data sources across the tree:
- Identify all data fetching hooks/calls
- Map which data each component needs vs what's available in ancestors
- Detect redundant fetches where data could be passed down
- Calculate the "fetch cost" of the current architecture

**Output for LLM**: "UserStats re-fetches user data that UserProfile already has. Consider passing user.stats directly instead of userId."

### 3. **Naming Consistency Analysis**
**Problem**: LLMs create adaptors instead of fixing naming at the source, causing concept pollution.

**Solution**: Analyze naming patterns across the codebase:
- Group props/variables that represent the same concept
- Detect naming variations (price, amount, cost, total, finalPrice)
- Identify adaptors that exist purely for renaming
- Suggest canonical names based on usage frequency

**Output for LLM**: "The concept 'price' has 5 different names across the codebase: price (12 uses), amount (8 uses), cost (3 uses), total (2 uses), finalPrice (2 uses). Consider standardizing on 'price'."

### 4. **Feature Boundary Analysis**
**Problem**: LLMs build on existing structure without seeing that the structure is a poorly-delineated mess.

**Solution**: Analyze prop groupings and component responsibilities:
- Detect props that don't belong together (discount props on image component)
- Identify components with multiple unrelated concerns
- Suggest component extraction based on prop clustering
- Show "responsibility creep" over git history

**Output for LLM**: "ProductImage has 4 unrelated feature concerns: image display (3 props), discount badges (3 props), arrival indicators (2 props), stock display (2 props). Consider extracting separate components."

### 5. **Architectural Smell Detection**
**Problem**: LLMs optimize locally without seeing global anti-patterns.

**Solution**: Pattern detection across the component tree:
- Prop drilling depth (passing props through 5+ levels)
- God components (components with 20+ props)
- Circular data flow (parent passes to child, child calls callback that updates parent's state that changes the prop)
- Dead prop detection (props defined but never used downstream)
- "Shotgun surgery" indicators (one change requires touching 10+ files)

**Output for LLM**: "Prop 'userId' is drilled through 7 components. Consider using Context or moving the data fetch closer to where it's used."

### 6. **Cross-File Impact Analysis**
**Problem**: LLMs change one file without understanding the ripple effects.

**Solution**: Show the impact radius of changes:
- "If you change this prop type, these 12 files need updates"
- "This component is used in 34 places - high-impact change"
- "This function is only called from one place - safe to refactor"
- Dependency graphs showing upstream and downstream effects

**Output for LLM**: "Changing User.displayName to User.name would require updates in 23 files. Here are the affected components: [list]"

### 7. **Context Window Optimization**
**Problem**: LLMs have limited context windows and need the most relevant information.

**Solution**: Generate optimized summaries for LLM consumption:
- Compressed component tree representations
- "What you need to know" summaries for each component
- Ranked list of related files by relevance
- Automatic identification of "you should also look at" files

**Output for LLM**: "To understand UserProfile, you should also read: useUserStats (data fetching), UserContext (where user data comes from), types/User.ts (type definitions)."

---

## Structural Analysis Features

### 8. **Pass-Through Component Detection**
**Problem**: Components that just forward props add complexity without value.

**Solution**: Identify components that:
- Receive props and pass them unchanged to children
- Add no logic, state, or visual elements
- Exist only because "that's where we put things"

**Output**: "ProductDetails forwards 6 of its 8 props directly to children. Consider flattening the component hierarchy."

### 9. **Props Shape Consistency**
**Problem**: Same data is destructured differently across the codebase.

**Solution**: Track how data shapes transform:
- `user` object passed whole vs destructured into `{id, name, email}`
- Detect inconsistent destructuring patterns
- Identify where shape transformations are actually needed vs arbitrary

**Output**: "User object is passed 3 different ways: whole object (5 places), {id, name} destructure (8 places), {userId, userName} renamed (3 places). Consider standardizing."

### 10. **Component Complexity Scoring**
**Problem**: LLMs need quick heuristics for "should I refactor this?"

**Solution**: Calculate complexity scores based on:
- Number of props (especially optional ones)
- Number of hooks
- Conditional rendering branches
- Child component count
- Lines of code

**Output**: "ProductImage complexity score: 8.5/10 (High). Contributing factors: 12 props, 4 conditional renders, 3 unrelated feature concerns."

---

## Developer Experience Features

### 11. **LLM-Friendly Export Format**
**Problem**: Current tools output for humans, not for LLM consumption.

**Solution**: Export formats optimized for LLM context windows:
- Condensed tree format (component names + key props only)
- Relationship-focused format (who calls whom, data flow)
- Problem-focused format (only show architectural issues)
- Configurable verbosity levels

### 12. **Refactoring Suggestion Engine**
**Problem**: LLMs need actionable suggestions, not just problem identification.

**Solution**: Generate specific refactoring recommendations:
- "Extract DiscountBadge from ProductImage"
- "Move data fetch from UserStats to UserProfile"
- "Rename 'finalPrice' to 'price' in useCart (affects 5 files)"
- Priority-ranked by impact and effort

### 13. **Component Search & Filtering**
**Problem**: Large applications have complex trees that are hard to navigate.

**Solution**: Advanced search and filtering:
- Search by component name, file path, or prop types
- Filter by component type (server/client/layout/page)
- Show only components with certain hooks or props
- Filter to show only "problematic" components

### 14. **VS Code / Cursor Integration**
**Problem**: Switching between analysis tool and code editor is cumbersome.

**Solution**: IDE extension features:
- Click component in overlay to open file in editor
- Show analysis data in sidebar
- Inline annotations for architectural issues
- "Related files" quick navigation

---

## CI/CD & Team Features

### 15. **Architecture Regression Detection**
**Problem**: Architectural debt accumulates silently.

**Solution**: CI integration to catch architectural problems:
- Block PRs that increase prop drilling depth
- Warn on new pass-through components
- Alert when naming inconsistency spreads
- Track architectural metrics over time

### 16. **Architecture Decision Records Integration**
**Problem**: LLMs don't know WHY the architecture is the way it is.

**Solution**: Connect analysis to ADRs:
- Link components to relevant architecture decisions
- Surface "this was intentional" vs "this is tech debt"
- Help LLMs understand constraints and trade-offs

---

## Implementation Priority

### Critical for LLM Usage (Immediate)
1. Prop lineage tracking
2. Data fetch duplication detection  
3. Naming consistency analysis
4. LLM-friendly export format
5. Cross-file impact analysis

### High Value (Q1-Q2 2026)
6. Feature boundary analysis
7. Architectural smell detection
8. Pass-through component detection
9. Refactoring suggestion engine

### Medium Priority (Q3-Q4 2026)
10. Component complexity scoring
11. Props shape consistency
12. VS Code / Cursor integration
13. Context window optimization

### Future (2027+)
14. Architecture regression detection
15. ADR integration
16. Team collaboration features

---

*Last updated: January 2026*
