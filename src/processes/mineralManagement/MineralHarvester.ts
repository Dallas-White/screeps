import Kernel from "Kernel";
import { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";

interface MinerlaHarvesterMemory {
    extractor: Id<Mineral>
    container: RoomPosition | undefined
}

export default class MineralHarvester extends CreepProcess<MinerlaHarvesterMemory> {

    constructor(kernel: Kernel, parent: SpawnManager, mineral: Mineral) {
        super(kernel, parent, parent, { extractor: mineral.id, container: undefined })
        this.memory.extractor = mineral.id
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
        if (this.memory.container && c.room.lookForAt(LOOK_CREEPS, this.memory.container.x, this.memory.container.y).length == 0) {
            c.moveTo(new RoomPosition(this.memory.container.x, this.memory.container.y, this.memory.container.roomName))
            return
        }
        let returnCode = c.harvest(Game.getObjectById(this.memory.extractor)! as Mineral)
        if (returnCode == ERR_NOT_IN_RANGE) c.moveTo(Game.getObjectById(this.memory.extractor)! as Mineral)
        else if (returnCode == ERR_NOT_ENOUGH_RESOURCES) this.sleep(MINERAL_REGEN_TIME) //This mineral source is depleated, wait for it to be regenerated
    }

    findAdjacentContainers() {
        let container = (Game.getObjectById(this.memory.extractor) as Mineral).pos.findInRange(FIND_STRUCTURES, 1, { filter: (x) => x.structureType == STRUCTURE_CONTAINER })
        if (container.length != 0) {
            this.memory.container = container[0].pos
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
