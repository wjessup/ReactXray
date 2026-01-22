# Technical Solutions

Real-world problem examples: `problem_examples.md`

---

## The RSC Split Architecture Problem

Next.js App Router uses React Server Components (RSC), which creates a split architecture with **multiple client/server boundaries**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ RootLayout  │ -> │StandardLayout│ -> │   Search    │         │
│  │ (layout.tsx)│    │ (layout.tsx) │    │ (page.tsx)  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│    HTML/RSC Payload ──────────────────────────────────────────► │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  React Fiber Tree starts here:                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ SearchPage  │ -> │ FilterPanel │ -> │  Results    │         │
│  │  (CLIENT)   │    │  (CLIENT)   │    │  (CLIENT)   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**Server Components:**
- Execute only on the server
- Can do direct data fetching (async/await)
- Output HTML/RSC payload sent to client
- **Do NOT exist in the client-side React fiber tree**

**Client Components:**
- Marked with `"use client"` directive
- Hydrate on the client
- Have state, effects, event handlers
- **Exist in the React fiber tree**

This means traditional React DevTools only see client components. The server component hierarchy is invisible.

## The Multiple Boundaries Problem

A single server component can render **multiple client components** at various depths:

```
StandardLayout [SERVER]
├── PreviewBanner [CLIENT] ← Bridge #1
├── SiteBanner [CLIENT] ← Bridge #2
├── ScrollToTop [CLIENT] ← Bridge #3
├── TipsProvider [wrapper]
│   └── SpecimenModalProvider [wrapper]
│       ├── HeaderWithSearch [SERVER]
│       │   └── ModernSearch [CLIENT] ← Bridge #4 (nested!)
│       ├── MainNavigationMenu [CLIENT] ← Bridge #5
│       ├── Footer [CLIENT] ← Bridge #6
│       └── MobileBottomNav [CLIENT] ← Bridge #7
└── {children} → page components
```

The challenge is that:
1. Library wrapper components (FeatureFlagProvider, TipsProvider) don't exist in our codebase
2. Project components can be deeply nested inside these wrappers
3. We need to find ALL project components rendered by a file, not just top-level ones

### Solution: Extract All Project Components

When analyzing a file's JSX, we extract components from ALL levels:
- `directChildren` - top-level JSX elements
- `nestedInComponent` - elements nested inside other components
- `inferredInComponent` - dynamically computed component references

The `getAllProjectComponentsFromFile` function gathers all of these, filters to only project components (those in our codebase), and adds them as children in the tree.

## Static Analysis Challenges

Building an accurate component tree from static analysis is hard. Here are the problems we hit and how we solved them:

### Problem 1: Flat Children List

Naive approach: scan for all `<Component>` tags in a file, add them as direct children.

```tsx
// layout.tsx
return (
  <Provider>
    <Header />
    <main>{children}</main>
    <Footer />
  </Provider>
)
```

Wrong result: `[Provider, Header, main, Footer]` all as siblings.
Correct result: `Provider` has children `[Header, main, Footer]`.

**Solution**: `extractJsxUsage()` tracks parent-child relationships using `nestedInComponent`:

```typescript
interface JsxUsage {
  directChildren: string[];                    // Top-level JSX
  nestedInComponent: Map<string, string[]>;    // Parent → children nested inside
  identifiersInComponent: Map<string, string[]>;
}
```

The `processJsxTree()` function walks JSX recursively, tracking the current parent component name and building the nesting map.

### Problem 2: Non-Project Components Hide Project Components

```tsx
// layout.tsx
return (
  <ThemeProvider>           // ← Library component (not in your codebase)
    <div className="layout"> // ← HTML element
      <Header />            // ← YOUR component - would be missed!
      <Sidebar />           // ← YOUR component - would be missed!
    </div>
  </ThemeProvider>
)
```

If we only track "direct children" of project components, `Header` and `Sidebar` get lost inside non-project parents (library components, HTML elements, third-party components).

**Solution**: `getAllProjectComponentsFromFile()` in `index.ts` extracts project components from ALL nesting levels:

```typescript
for (const [parentName, nested] of jsxUsage.nestedInComponent) {
  if (!nameToFileMap.has(parentName)) {  // Parent is NOT a project component
    for (const name of nested) {
      if (nameToFileMap.has(name) && !hasProjectAncestor(name)) {
        allComponents.add(name);  // Promote to direct child
      }
    }
  }
}
```

This "promotes" project components nested inside non-project parents up to direct children. Note: HTML elements like `div` are treated as transparent - we don't track their structure, only the project components within them.

### Problem 3: Conditional Rendering

```tsx
return (
  <div>
    {isLoggedIn && <UserMenu />}
    {showBanner ? <Banner /> : <Placeholder />}
  </div>
)
```

Components inside `&&` or ternaries would be missed.

**Solution**: `processJsxTree()` handles expression types:

```typescript
} else if (Node.isConditionalExpression(node)) {
  processJsxTree(node.getWhenTrue(), parentName);   // Banner
  processJsxTree(node.getWhenFalse(), parentName);  // Placeholder
} else if (Node.isBinaryExpression(node)) {
  processJsxTree(node.getRight(), parentName);      // UserMenu (after &&)
}
```

### Problem 4: Components Passed as Props

```tsx
<Layout 
  sidebar={<Sidebar />}      // JSX as prop
  header={<Header />}        // JSX as prop
>
  <MainContent />
</Layout>
```

`Sidebar` and `Header` aren't children of `Layout` in the JSX tree - they're attributes.

**Solution**: Walk JSX attributes too:

```typescript
const attributes = Node.isJsxElement(node)
  ? node.getOpeningElement().getAttributes()
  : node.getAttributes();

for (const attr of attributes) {
  if (Node.isJsxAttribute(attr)) {
    const init = attr.getInitializer();
    if (init) {
      processJsxTree(init, tagName);  // Recurse into attribute value
    }
  }
}
```

### Problem 5: Dynamic Components from Hooks/Functions

```tsx
// useFilterSections.ts
const FILTER_COMPONENTS = {
  text: { Component: TextFilterSection },
  color: { Component: ColorFilterSection },
};

export function useFilterSections(view: string) {
  return ["text", "color"].map((key) => {
    const { Component } = FILTER_COMPONENTS[key];
    return { content: <Component />, title: key };
  });
}

// SearchPage.tsx
const sections = useFilterSections("grid");
return sections.map(s => <FilterPanel>{s.content}</FilterPanel>);
```

Static analysis sees `<Component />` - a dynamic variable. How do we know it's actually `TextFilterSection` and `ColorFilterSection`?

**Solution**: Generic pattern detection in `extractJsxExports()` (in `ast.ts`):

**Step 1: Scan const objects for component references**

```typescript
// Walk all variable declarations in the file
sourceFile.forEachDescendant((node) => {
  if (Node.isVariableDeclaration(node)) {
    collectComponentRefs(init, null);  // Scan FILTER_COMPONENTS
  }
});
```

This builds a map of property names to component names:
```javascript
componentsByPropertyName = {
  "Component": Set(["TextFilterSection", "ColorFilterSection"])
}
```

**Step 2: Detect `.map()` / `.flatMap()` patterns returning objects**

```typescript
if (methodName === "map" || methodName === "filter" || methodName === "flatMap") {
  const body = callback.getBody();
  if (Node.isObjectLiteralExpression(body)) {
    // Extract JSX from { content: <Component /> }
    const objJsx = extractJsxFromObjectLiteral(body);
    for (const [key, jsx] of objJsx) {
      propsJsx.set(key, jsx);  // "content" → ["Component"]
    }
  }
}
```

**Step 3: Resolve dynamic names back to actual components**

```typescript
function resolveComponentName(name: string): string[] {
  const resolved = componentsByPropertyName.get(name);
  if (resolved) return Array.from(resolved);  // "Component" → ["TextFilterSection", "ColorFilterSection"]
  return [name];
}
```

**Result**: For `useFilterSections`, we extract:
```typescript
{
  exportName: "useFilterSections",
  jsxInProperties: Map {
    "content" → ["TextFilterSection", "ColorFilterSection"]
  }
}
```

**Step 4: Connect to consuming files**

When `SearchPage` imports and calls `useFilterSections()`:
1. `resolveJsxImports()` tracks the import
2. `extractInferredJsx()` sees the hook call and looks up its export data
3. `inferredInComponent` map connects `SearchPage` → `[TextFilterSection, ColorFilterSection]`

```typescript
interface EnhancedJsxUsage extends JsxUsage {
  inferredInComponent: Map<string, string[]>;  // Parent → dynamically computed children
}
```

**This is fully generic** - works for any:
- Hook returning objects with JSX (`useModal`, `usePanel`, `useNavigation`)
- Function returning arrays of config objects
- Const objects mapping keys to components
- `.map()` / `.flatMap()` / `.filter()` patterns

It's fuzzy (can't know runtime values) but catches common config-driven UI patterns.

## The Prop Drilling Problem

Real-world React applications often develop "prop drilling" - threading data through multiple component layers. This is **hard for AI to understand** because:

1. The prop name changes at each layer
2. The same data gets bundled/unbundled through different object shapes
3. Derived state obscures where data actually comes from

### Real-World Example: SpecimenForm in crystal-market-mvp

Here's an actual component chain from a production Next.js app:

```
saveSpecimenAction.ts (server action)
       ↓ calls
saveSpecimenData() with mapped input
       ↑ receives from
SpecimenForm.tsx (8 props interface)
       ↓ passes to
EditSpecimenSaveActions.tsx (flags object + actions)
SpecimenFormTabs.tsx (10+ props)
       ↓ passes to
PersonalOwnerSection.tsx
SpecimenMediaFieldWithPreview.tsx
```

**The Props Interface at the Top:**

```typescript
// SpecimenForm.tsx - 8 props coming in
interface Props {
  isOwner: boolean;
  specimen?: EditSpecimenResponse;
  listingData?: EditListingResponse;
  listingDefaultData?: ListingFormInput;
  isContribution?: boolean;
  shipsFromDropdownOptions: Option[];
  defaultForSale?: boolean;
  defaultTab?: SpecimenTabValue;
}
```

**Prop Bundling/Unbundling**

The component bundles 6 booleans into a `flags` object just to pass them down:

```typescript
// SpecimenForm.tsx bundles flags
<EditSpecimenSaveActions
  flags={{
    isContribution: isContributionMode,
    isPublished: specimen?.status === "published",
    isFormDirty: Object.keys(dirtyFields).length !== 0,
    isSaving: isPending || isRedirecting,
    listingNotLocked,
    listingPublishBlocked,
  }}
  actions={{ save: handleSaveSpecimen }}
/>

// EditSpecimenSaveActions.tsx immediately destructures them back out
const {
  isSaving,
  isPublished,
  isFormDirty,
  listingNotLocked,
  isContribution,
  listingPublishBlocked,
} = flags;
```

This is pure ceremony - the bundling adds no value.

**Same Concept, Multiple Representations**

The same "contribution mode" concept appears in different forms:

```typescript
// As a boolean prop
isContribution?: boolean;

// Derived in SpecimenForm
const isContributionMode = isContribution || isOwnerFromForm === false;

// As an enum in child components
type: SpecimenEditType  // "contribution" | "personal" | "manage" | "merge-duplicates"

// Then checked repeatedly
if (type === "contribution" || isOwner === false) { ... }
```

**Redundant State Through Layers**

```typescript
// SpecimenForm passes to SpecimenFormTabs
<SpecimenFormTabs
  isOwner={isOwner}                           // boolean
  type={isContributionMode ? "contribution" : "personal"}  // derived
  canTransferOwnership={isOwner && specimen?.status === "published"}  // derived
  isNewSpecimen={!specimen}                   // derived  
  shipsFromDropdownOptions={shipsFromDropdownOptions}  // pass-through
  specimenStatus={specimen?.status}           // pass-through from specimen
  pendingOwnerAlert={pendingOwnerAlert}       // complex derived object
/>

// SpecimenFormTabs then passes subsets to children
<PersonalOwnerSection
  type={type}
  canTransferOwnership={canTransferOwnership}
/>

<SpecimenMediaFieldWithPreview
  type={type}
  isNewSpecimen={isNewSpecimen}
  specimenStatus={specimenStatus}
/>
```

**Form Context + Props Redundancy**

Children use `useFormContext()` but ALSO receive props derivable from form state:

```typescript
// PersonalOwnerSection.tsx
export function PersonalOwnerSection({ canTransferOwnership, type }: Props) {
  const { setValue, getValues } = useFormContext();  // Has access to all form state
  const isOwner = useWatch({ name: "isOwner" });     // Can watch any field
  const forSale = useWatch({ name: "forSale" });     // Already knows this
  
  // But still receives `type` as a prop even though it could derive it
  const isContributionMode = type === "contribution" || isOwner === false;
}
```

### What Prop Lineage Analysis Detects

The `prop-lineage.ts` analyzer detects these smells:

| Smell | Description | Suggestion |
|-------|-------------|------------|
| `excessive-renaming` | Prop renamed 3+ times with no transformation | Pass original object, let leaf extract what it needs |
| `circular-naming` | Prop renamed through chain, ends up same name | Remove intermediate renames |
| `prop-drilling` | Prop passes through 5+ components | Use Context or move data fetching closer |
| `pass-through` | Component passes >50% of props without using them | Consider removing from hierarchy |
| `no-op-function` | Function only renames fields | Delete function, use original names |

### How This Helps AI

When an AI encounters `SpecimenMediaFieldWithPreview` receiving `specimenStatus`, it has no idea:
- Where `specimenStatus` originated
- What transformations it went through
- Whether the prop name at the origin was even `status`

Prop lineage analysis gives the AI the full chain:

```
Origin: EditSpecimenResponse.status (from server)
  ↓ specimen?.status (destructure in SpecimenForm)
  ↓ specimenStatus (rename at SpecimenFormTabs)
  ↓ specimenStatus (pass-through to SpecimenMediaFieldWithPreview)
```

Now the AI can:
1. Understand the actual data shape (it's `SpecimenStatus` type from the server)
2. Know it wasn't transformed, just renamed
3. Suggest improvements (pass `specimen` directly, let child access `.status`)
