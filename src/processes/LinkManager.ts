import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import { CarrierJobFinishedCallback } from "./LogisticsManager";
import RoomManagerProcess from "./RoomManagerProcess";

const STORAGE_LINK_MIN = 200
const STORAGE_LINK_MAX = 600

enum LogisticsTaskType {
    PULL = 0,
    PUSH = 1
}

interface LinkManagerMemory {
    links: {
        nonSourceLinks: Array<Id<StructureLink>>
        sourceLinks: Array<Id<StructureLink>>
        storageLink: Id<StructureLink> | undefined
    }
    logisticsTask: LogisticsTaskID | undefined
    logisticsTaskType: LogisticsTaskType | undefined
    room: string
}
export default class LinkManager extends Process<LinkManagerMemory> implements CarrierJobFinishedCallback {

    constructor(kernel: Kernel, parent: RoomManagerProcess, room: string) {
        super(kernel, parent, {
            links: {
                nonSourceLinks: [],
                sourceLinks: [],
                storageLink: undefined
            },

            room: room,
            logisticsTask: undefined,
            logisticsTaskType: undefined
        })
    }
    onCarrierJobFinished(id: LogisticsTask): void {
        this.memory.logisticsTask = undefined
        this.memory.logisticsTaskType = undefined
    }

    run(): void {
        if (!this.memory.links || !this.memory.links.storageLink || Game.time % 1000 == 0) {
            this.linkScan()
        }
        let freeNonSourceLinks: StructureLink[] = (this.memory.links.nonSourceLinks.map((s: Id<StructureLink>) => Game.getObjectById(s)) as StructureLink[]).sort((a: StructureLink, b: StructureLink) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY)).filter((link) => link.store.getFreeCapacity(RESOURCE_ENERGY) > 50)
        let filledSourceLinks: StructureLink[] = (this.memory.links.sourceLinks.map((s: Id<StructureLink>) => Game.getObjectById(s)).filter((s) => (s != null)) as StructureLink[]).filter((link: StructureLink) => link!.store.getUsedCapacity(RESOURCE_ENERGY) > 50)
        if (freeNonSourceLinks.length != 0) {
            for (let sourceLink of filledSourceLinks) {
                sourceLink.transferEnergy(freeNonSourceLinks[0])
            }
        }
        if (this.memory.links.storageLink) {
            let storageLink = Game.getObjectById(this.memory.links.storageLink)
            if (storageLink) {
                if (storageLink.store.getUsedCapacity(RESOURCE_ENERGY) > STORAGE_LINK_MAX) {
                    if (this.memory.logisticsTask) {
                        if (this.memory.logisticsTaskType == LogisticsTaskType.PUSH) {
                            (this.getParent() as RoomManagerProcess).getLogisticsManager().resizeTask(this.memory.logisticsTask, storageLink.store.getUsedCapacity(RESOURCE_ENERGY) - STORAGE_LINK_MIN)
                        } else {
                            (this.getParent() as RoomManagerProcess).getLogisticsManager().cancelTask(this.memory.logisticsTask)
                            this.memory.logisticsTask = undefined
                        }
                    }
                    if (!this.memory.logisticsTask) {
                        this.memory.logisticsTask = (this.getParent() as RoomManagerProcess).getLogisticsManager().addLogisticTask({
                            amount: storageLink.store.getUsedCapacity(RESOURCE_ENERGY) - STORAGE_LINK_MIN,
                            priority: 500,
                            source: this.memory.links.storageLink,
                            dest: undefined,
                            resource: RESOURCE_ENERGY,
                            callback: this.getPID()
                        })
                        this.memory.logisticsTaskType = LogisticsTaskType.PUSH
                    }
                } else if (storageLink.store.getUsedCapacity(RESOURCE_ENERGY) < STORAGE_LINK_MIN) {
                    if (this.memory.logisticsTask) {
                        if (this.memory.logisticsTaskType == LogisticsTaskType.PULL) {
                            (this.getParent() as RoomManagerProcess).getLogisticsManager().resizeTask(this.memory.logisticsTask, storageLink.store.getUsedCapacity(RESOURCE_ENERGY) - STORAGE_LINK_MIN)
                        } else {
                            (this.getParent() as RoomManagerProcess).getLogisticsManager().cancelTask(this.memory.logisticsTask)
                            this.memory.logisticsTask = undefined
                        }
                    }
                    if (!this.memory.logisticsTask) {
                        this.memory.logisticsTask = (this.getParent() as RoomManagerProcess).getLogisticsManager().addLogisticTask({
                            amount: STORAGE_LINK_MIN,
                            priority: 500,
                            dest: this.memory.links.storageLink,
                            source: undefined,
                            resource: RESOURCE_ENERGY,
                            callback: this.getPID()
                        })
                        this.memory.logisticsTaskType = LogisticsTaskType.PULL
                    } else {
                        (this.getParent() as RoomManagerProcess).getLogisticsManager().resizeTask(this.memory.logisticsTask, STORAGE_LINK_MIN)
                    }
                }
            }
        }


    }

    linkScan() {
        this.memory.links = { sourceLinks: [], nonSourceLinks: [], storageLink: undefined }
        let room = Game.rooms[this.memory.room]
        let sources = room.find(FIND_SOURCES)
        if (room.storage) {
            this.memory.links.storageLink = room.storage.pos.findClosestByRange(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_LINK })?.id as Id<StructureLink>
        }
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
