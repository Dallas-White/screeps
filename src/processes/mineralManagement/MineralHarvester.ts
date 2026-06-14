import Kernel from "Kernel";
import { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { CarrierJobFinishedCallback } from "processes/LogisticsManager";
import RoomManagerProcess from "processes/RoomManagerProcess";
import { SpawnManager } from "SpawnManager";

interface MinerlaHarvesterMemory {
    extractor: Id<Mineral>
    container: {
        id: Id<StructureContainer>
        pos: RoomPosition
    } | undefined
    storeJob: LogisticsTaskID | undefined
}

export default class MineralHarvester extends CreepProcess<MinerlaHarvesterMemory> implements CarrierJobFinishedCallback {

    constructor(kernel: Kernel, parent: RoomManagerProcess, mineral: Mineral) {
        super(kernel, parent, parent, { extractor: mineral.id, container: undefined, storeJob: undefined })
        this.memory.extractor = mineral.id
    }
    onCarrierJobFinished(id: LogisticsTask): void {
        this.memory.storeJob = undefined
    }

    initCreepMemory(): {} {
        return {}
    }

    getSpawningPriority(): number {
        return 0
    }

    runCreep(c: Creep): void {
        if (!this.memory.container) {
            this.findAdjacentContainers()
        }
        if (this.memory.container && c.room.lookForAt(LOOK_CREEPS, this.memory.container.pos.x, this.memory.container.pos.y).length == 0) {
            c.moveTo(new RoomPosition(this.memory.container.pos.x, this.memory.container.pos.y, this.memory.container.pos.roomName))
            return
        }
        if (this.memory.container) {
            let containerObject = Game.getObjectById(this.memory.container.id);
            let mineralObject = Game.getObjectById(this.memory.extractor)!
            if (containerObject) {
                let mineralStore = containerObject.store[mineralObject.mineralType]
                if (mineralStore > 0) {
                    if (this.memory.storeJob) {
                        (this.getParent() as RoomManagerProcess).getLogisticsManager().resizeTask(this.memory.storeJob, mineralStore)
                    } else {
                        this.memory.storeJob = (this.getParent() as RoomManagerProcess).getLogisticsManager().addLogisticTask({
                            priority: 250,
                            amount: mineralStore,
                            source: this.memory.container.id,
                            dest: c.room.storage?.id,
                            resource: mineralObject.mineralType,
                            callback: this.getPID()
                        })

                    }
                }
            } else {
                this.memory.container = undefined
            }
        }
        let returnCode = c.harvest(Game.getObjectById(this.memory.extractor)! as Mineral)
        if (returnCode == ERR_NOT_IN_RANGE) c.moveTo(Game.getObjectById(this.memory.extractor)! as Mineral)
        else if (returnCode == ERR_NOT_ENOUGH_RESOURCES) this.sleep(MINERAL_REGEN_TIME) //This mineral source is depleated, wait for it to be regenerated
    }

    findAdjacentContainers() {
        let container = (Game.getObjectById(this.memory.extractor) as Mineral).pos.findInRange(FIND_STRUCTURES, 1, { filter: (x) => x.structureType == STRUCTURE_CONTAINER })
        if (container.length != 0) {
            this.memory.container = {
                pos: container[0].pos,
                id: container[0].id as Id<StructureContainer>
            }
        } else {
            this.memory.container = undefined
        }
    }
    onCreepDeath(): void { }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, WORK, WORK, WORK], 10, [], 1]
    }

    getType(): string {
        return "MineralHarvester"
    }
}

ProcessRegistry.register("MineralHarvester", MineralHarvester)
