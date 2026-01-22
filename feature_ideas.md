# Feature Ideas & Roadmap

---

## Purpose and Goals

This tool exists to help **LLMs like Claude Opus 4.5 make good architectural and refactoring decisions**.

Core framing lives in `README.md`.

---

## Examples of Problems We Need to Detect

These examples live in `problem_examples.md` so we keep “feature ideas” and “problems” separated.

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

### 8. **Component Usage Context ("Look Up" Analysis)**
**Problem**: LLMs look DOWN into a component's implementation but never look UP to see where it's used, or ACROSS to see similar components.

**Solution**: For any component, surface:
- **Usage graph**: Where is this component imported? What pages does it appear on?
- **Context variety**: How different are the usage contexts? (dealer vs public vs private)
- **Similar components**: Other components with similar names, props, or structure
- **Duplication detection**: Components that share >70% of their code
- **Type similarity**: Different type definitions with overlapping fields

**Output for LLM**: 
```
SpecimenCard usage context:
- Direct parents: DealerInventoryGrid, CollectionGallery, PrivateCollectionList
- Page contexts: 8 pages across 3 features (dealer, public, private)
- Context differences: dealer shows wholesale prices, public shows retail, private shows acquisition cost

Similar components found:
- DealerSpecimenCard.tsx (340 lines) - 82% code overlap
- PublicSpecimenCard.tsx (285 lines) - 78% code overlap
- PrivateSpecimenCard.tsx (310 lines) - 75% code overlap
⚠️ Consider unifying these 4 components (935 lines → ~400 lines estimated)

Similar types found:
- DealerSpecimen, PublicSpecimen, CollectorSpecimen share 15 of 20 fields
⚠️ Consider creating base Specimen type with context-specific extensions
```

**Why this matters**: Without this, an LLM adds a feature to `DealerSpecimenCard`, doesn't realize `PublicSpecimenCard` and `PrivateSpecimenCard` exist, and the codebase diverges further. Or worse, creates a FOURTH card component because it didn't know any existed.

### 9. **Change Propagation Detection (Automated "Missed Update" Catching)**
**Problem**: You improve search on the main search page. Users report "search is great now, but when I search my collection it still has the old behavior." You updated one component but there were 3 similar components that needed the same change.

Currently this is caught by:
- User bug reports ("collection search is broken")
- QA manually testing every similar feature
- Code review (if reviewer happens to know about the other components)

All of these are slow, expensive, and unreliable.

**Solution**: Automated detection at multiple stages:

**1. At commit time (pre-commit/CI hook)**:
```
⚠️ CHANGE PROPAGATION WARNING

You modified: SearchResults.tsx
- Added: filter by date range
- Added: sort by relevance

Similar components that may need the same change:
├── CollectionSearchResults.tsx (78% code similarity)
│   └── Does NOT have: filter by date range, sort by relevance
├── DealerInventorySearch.tsx (72% code similarity)  
│   └── Does NOT have: filter by date range, sort by relevance
└── AdminUserSearch.tsx (65% code similarity)
    └── Does NOT have: filter by date range

Action required: Confirm these components should NOT get this change, or update them.
```

**2. At PR review time**:
- Automatically add reviewers who own the related components
- Generate "blast radius" report showing what else might need updating
- Block merge until similar components are explicitly marked "intentionally different" or updated

**3. Continuous monitoring (post-merge)**:
- Track feature parity across similar components
- Alert when components that were in sync start diverging
- Generate "drift reports" showing which features exist where

**4. Semantic feature detection** (not just code similarity):
```
Feature: "date range filter"
Present in:
✅ SearchResults.tsx (added in PR #1234)
❌ CollectionSearchResults.tsx  
❌ DealerInventorySearch.tsx

Feature: "sort by relevance"  
Present in:
✅ SearchResults.tsx (added in PR #1234)
✅ CollectionSearchResults.tsx (added in PR #1156, different implementation)
❌ DealerInventorySearch.tsx
```

**Implementation approaches**:
- **AST-based**: Detect similar function structures, hook usage patterns, prop signatures
- **Semantic**: Use embeddings to find conceptually similar code (search, filter, sort, paginate)
- **Behavioral**: Track what features/capabilities each component has
- **Historical**: Learn from past "missed update" bugs which components tend to need synchronized changes

**Output for LLM**:
```
Before making changes to SearchResults.tsx, be aware:
- 3 similar search components exist in the codebase
- These components have historically been updated together (8 of last 10 changes)
- Last time SearchResults was updated alone, a bug was filed 2 weeks later for CollectionSearchResults

Recommendation: Update all 4 components together, or document why this change is specific to SearchResults.
```

**Why this is critical**: This is the difference between reactive bug-fixing ("users found a problem") and proactive consistency ("we caught it before it shipped"). The tool should make it HARDER to update one component without at least acknowledging the related ones.

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

## Implementation Status

### Completed Features

#### Architecture Tab in Component Dialog
**Status**: ✅ Implemented

New "Architecture" tab added to the component detail dialog showing:

1. **Usage Context**
   - Total usage count
   - Which components use this component
   - Which page contexts it appears in

2. **Similar Components Detection**
   - Finds components with similar names or overlapping props
   - Shows similarity percentage
   - Lists shared props

3. **Architecture Issues**
   - Pass-through component detection (components that just forward props)
   - No-op function detection (functions that only rename fields)
   - Similar component warnings

4. **Pass-Through Analysis**
   - Visual bar showing ratio of props passed through vs used
   - Helps identify components that add complexity without value

**Files Added**:
- `src/analyze/ast/prop-lineage.ts` - Prop passing analysis, no-op detection
- `src/analyze/ast/usage-context.ts` - Component usage tracking, similarity detection

**Files Modified**:
- `src/types.ts` - Added ArchitectureAnalysis types
- `src/analyze/index.ts` - Integrated architecture analysis into route analysis
- `src/overlay/index.ts` - Added Architecture tab rendering
- `src/overlay/styles.ts` - Added Architecture tab styles

### In Progress

- Prop lineage visualization (tracking full rename chains)
- Data fetch duplication detection
- Change propagation warnings

### Next Up

- LLM-friendly export format
- Naming consistency analysis
- Component complexity scoring

---

*Last updated: January 2026*
