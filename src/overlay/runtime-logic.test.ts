import { describe, it, expect } from "vitest";
import {
  buildFiberLookupByName,
  findNodeIdForFiber,
  findInstanceIndexForFiber,
  getNodeByPath,
  mergeStaticWithFiber,
  sortFiberLookupForMerge,
} from "./runtime-logic.js";

describe("overlay runtime logic", () => {
  it("merges duplicate component names under the correct parent fiber", () => {
    const featuredWrapperFiber: any = {};
    const dropsWrapperFiber: any = {};
    const featuredCardFiber: any = { return: featuredWrapperFiber };
    const dropsCardFiber: any = { return: dropsWrapperFiber };

    const fiberTree = [
      {
        name: "FeaturedWrapper",
        fiber: featuredWrapperFiber,
        children: [
          { name: "SpecimenCard", fiber: featuredCardFiber, children: [] },
        ],
      },
      {
        name: "TopDropsWrapper",
        fiber: dropsWrapperFiber,
        children: [
          { name: "SpecimenCard", fiber: dropsCardFiber, children: [] },
        ],
      },
    ];

    const staticTree = [
      {
        file: "FeaturedWrapper.tsx",
        component: {
          name: "FeaturedWrapper",
          isClientComponent: true,
          filePath: "FeaturedWrapper.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
      {
        file: "TopDropsWrapper.tsx",
        component: {
          name: "TopDropsWrapper",
          isClientComponent: true,
          filePath: "TopDropsWrapper.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
    ];

    const lookup = buildFiberLookupByName(fiberTree as any[]);
    sortFiberLookupForMerge(lookup);
    const merged = mergeStaticWithFiber(staticTree as any[], lookup);

    expect(merged[0].fiber).toBe(featuredWrapperFiber);
    expect(merged[0].children[0].fiber).toBe(featuredCardFiber);
    expect(merged[1].fiber).toBe(dropsWrapperFiber);
    expect(merged[1].children[0].fiber).toBe(dropsCardFiber);
  });

  it("finds the correct node id for a clicked fiber", () => {
    const featuredWrapperFiber: any = {};
    const dropsWrapperFiber: any = {};
    const featuredCardFiber: any = { return: featuredWrapperFiber };
    const dropsCardFiber: any = { return: dropsWrapperFiber };

    const mergedTree = [
      {
        fiber: featuredWrapperFiber,
        children: [{ fiber: featuredCardFiber, children: [] }],
      },
      {
        fiber: dropsWrapperFiber,
        children: [{ fiber: dropsCardFiber, children: [] }],
      },
    ];

    expect(findNodeIdForFiber(mergedTree as any[], featuredCardFiber)).toBe(
      "0-0",
    );
    expect(findNodeIdForFiber(mergedTree as any[], dropsCardFiber)).toBe("1-0");
  });

  it("merges duplicates correctly even without a parent fiber using dom order", () => {
    const featuredCardFiber: any = {};
    const dropsCardFiber: any = {};

    const fiberTree = [
      {
        name: "SpecimenCard",
        fiber: featuredCardFiber,
        __roY: 100,
        __roX: 10,
        children: [],
      },
      {
        name: "SpecimenCard",
        fiber: dropsCardFiber,
        __roY: 900,
        __roX: 10,
        children: [],
      },
    ];

    const staticTree = [
      {
        file: "FeaturedSection.tsx",
        component: {
          name: "FeaturedSection",
          isClientComponent: false,
          filePath: "FeaturedSection.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
      {
        file: "TopDropsSection.tsx",
        component: {
          name: "TopDropsSection",
          isClientComponent: false,
          filePath: "TopDropsSection.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
    ];

    const lookup = buildFiberLookupByName(fiberTree as any[]);
    sortFiberLookupForMerge(lookup);
    const merged = mergeStaticWithFiber(staticTree as any[], lookup);

    expect(merged[0].children[0].fiber).toBe(featuredCardFiber);
    expect(merged[1].children[0].fiber).toBe(dropsCardFiber);
  });

  it("collects multiple instances when parentFiber is known", () => {
    const wrapperFiber: any = {};
    const card1Fiber: any = { return: wrapperFiber };
    const card2Fiber: any = { return: wrapperFiber };
    const card3Fiber: any = { return: wrapperFiber };

    const fiberTree = [
      {
        name: "Wrapper",
        fiber: wrapperFiber,
        children: [
          { name: "SpecimenCard", fiber: card1Fiber, children: [] },
          { name: "SpecimenCard", fiber: card2Fiber, children: [] },
          { name: "SpecimenCard", fiber: card3Fiber, children: [] },
        ],
      },
    ];

    const staticTree = [
      {
        file: "Wrapper.tsx",
        component: {
          name: "Wrapper",
          isClientComponent: true,
          filePath: "Wrapper.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
    ];

    const lookup = buildFiberLookupByName(fiberTree as any[]);
    sortFiberLookupForMerge(lookup);
    const merged = mergeStaticWithFiber(staticTree as any[], lookup);

    const specimenNode = merged[0].children[0];
    expect(specimenNode.fiber).toBe(card1Fiber);
    expect(specimenNode.instances).toBeDefined();
    expect(specimenNode.instances.length).toBe(3);
    expect(specimenNode.instances[0].fiber).toBe(card1Fiber);
    expect(specimenNode.instances[1].fiber).toBe(card2Fiber);
    expect(specimenNode.instances[2].fiber).toBe(card3Fiber);
  });

  it("partitions instances by parent fiber across sections", () => {
    const featuredWrapper: any = {};
    const dropsWrapper: any = {};
    const featuredCard1: any = { return: featuredWrapper };
    const featuredCard2: any = { return: featuredWrapper };
    const dropsCard1: any = { return: dropsWrapper };
    const dropsCard2: any = { return: dropsWrapper };
    const dropsCard3: any = { return: dropsWrapper };

    const fiberTree = [
      {
        name: "FeaturedWrapper",
        fiber: featuredWrapper,
        children: [
          { name: "SpecimenCard", fiber: featuredCard1, children: [] },
          { name: "SpecimenCard", fiber: featuredCard2, children: [] },
        ],
      },
      {
        name: "DropsWrapper",
        fiber: dropsWrapper,
        children: [
          { name: "SpecimenCard", fiber: dropsCard1, children: [] },
          { name: "SpecimenCard", fiber: dropsCard2, children: [] },
          { name: "SpecimenCard", fiber: dropsCard3, children: [] },
        ],
      },
    ];

    const staticTree = [
      {
        file: "FeaturedWrapper.tsx",
        component: {
          name: "FeaturedWrapper",
          isClientComponent: true,
          filePath: "FeaturedWrapper.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
      {
        file: "DropsWrapper.tsx",
        component: {
          name: "DropsWrapper",
          isClientComponent: true,
          filePath: "DropsWrapper.tsx",
        },
        children: [
          {
            file: "SpecimenCard.tsx",
            component: {
              name: "SpecimenCard",
              isClientComponent: true,
              filePath: "SpecimenCard.tsx",
            },
            children: [],
          },
        ],
      },
    ];

    const lookup = buildFiberLookupByName(fiberTree as any[]);
    sortFiberLookupForMerge(lookup);
    const merged = mergeStaticWithFiber(staticTree as any[], lookup);

    const featuredSpecimen = merged[0].children[0];
    expect(featuredSpecimen.instances.length).toBe(2);
    expect(featuredSpecimen.instances[0].fiber).toBe(featuredCard1);
    expect(featuredSpecimen.instances[1].fiber).toBe(featuredCard2);

    const dropsSpecimen = merged[1].children[0];
    expect(dropsSpecimen.instances.length).toBe(3);
    expect(dropsSpecimen.instances[0].fiber).toBe(dropsCard1);
    expect(dropsSpecimen.instances[1].fiber).toBe(dropsCard2);
    expect(dropsSpecimen.instances[2].fiber).toBe(dropsCard3);
  });

  it("findInstanceIndexForFiber returns correct index", () => {
    const card1Fiber: any = {};
    const card2Fiber: any = { return: card1Fiber };
    const card3Fiber: any = { return: card2Fiber };
    const childFiber: any = { return: card2Fiber };

    const node = {
      instances: [
        { fiber: card1Fiber },
        { fiber: card2Fiber },
        { fiber: card3Fiber },
      ],
    };

    expect(findInstanceIndexForFiber(node, card1Fiber)).toBe(0);
    expect(findInstanceIndexForFiber(node, card2Fiber)).toBe(1);
    expect(findInstanceIndexForFiber(node, card3Fiber)).toBe(2);
    expect(findInstanceIndexForFiber(node, childFiber)).toBe(1);
  });

  it("getNodeByPath retrieves the correct node", () => {
    const tree = [
      {
        component: { name: "A" },
        children: [
          { component: { name: "B" }, children: [] },
          {
            component: { name: "C" },
            children: [{ component: { name: "D" }, children: [] }],
          },
        ],
      },
      { component: { name: "E" }, children: [] },
    ];

    expect(getNodeByPath(tree, "0")?.component?.name).toBe("A");
    expect(getNodeByPath(tree, "0-0")?.component?.name).toBe("B");
    expect(getNodeByPath(tree, "0-1")?.component?.name).toBe("C");
    expect(getNodeByPath(tree, "0-1-0")?.component?.name).toBe("D");
    expect(getNodeByPath(tree, "1")?.component?.name).toBe("E");
    expect(getNodeByPath(tree, "2")).toBeNull();
  });
});
