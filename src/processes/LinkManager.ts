import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";

export default class LinkManager extends Process {

    constructor(kernel: Kernel, parent: number, room: string) {
        super(kernel, parent)
        this.memory.room = room

    }

    run(): void {
        if (!this.memory.links || Game.time % 1000 == 0) {
            this.linkScan()
        }
        let freeNonSourceLinks: StructureLink[] = this.memory.links.nonSourceLinks.filter((link: Id<StructureLink>) => (Game.getObjectById(link) as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 50).map((s: Id<StructureLink>) => Game.getObjectById(s)).sort((a: StructureLink, b: StructureLink) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY));
        let filledSourceLinks: StructureLink[] = this.memory.links.sourceLinks.filter((link: Id<StructureLink>) => (Game.getObjectById(link) as StructureLink).store.getUsedCapacity(RESOURCE_ENERGY) > 50).map((s: Id<StructureLink>) => Game.getObjectById(s))
        if(freeNonSourceLinks.length == 0) return
        for (let sourceLink of filledSourceLinks) {
            sourceLink.transferEnergy(freeNonSourceLinks[0])
        }
    }

    linkScan() {
        this.memory.links = { sourceLinks: [], nonSourceLinks: []}
        let room = Game.rooms[this.memory.room]
        let sources = room.find(FIND_SOURCES)
        let links: StructureLink[] = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_LINK })
        for (let link of links) {
            if (sources.some((s) => s.pos.inRangeTo(link.pos, 2))) {
                this.memory.links.sourceLinks.push(link.id)
            } else {
                this.memory.links.nonSourceLinks.push(link.id)
            }
        }
    }

    getType(): string {
        return "LinkManager"
    }

}

ProcessRegistry.register("LinkManager", LinkManager)
