export type ReactionTree = [ResourceConstant | ReactionTree, ResourceConstant | ReactionTree]

export const NATURAL_RESOURCES = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST]

export function generateReactionTree(resource: ResourceConstant): ReactionTree | ResourceConstant {
    if (resource in NATURAL_RESOURCES) return resource
    for (let base in REACTIONS) {
        for (let reactent in REACTIONS[base]) {
            if (REACTIONS[base][reactent] == resource) {
                return [generateReactionTree(base as ResourceConstant),generateReactionTree(reactent as ResourceConstant)]
            }
        }
    }
    throw new Error("We should have found something by now")
}
