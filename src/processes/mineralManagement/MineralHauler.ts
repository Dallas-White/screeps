import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";


interface MineralHaulerMemory {
    room: string,
    container: Id<StructureContainer> | undefined,
    resourceType: ResourceConstant
}

export default class MineralHauler extends CreepProcess<MineralHaulerMemory> {

    constructor(kernel: Kernel, parent: SpawnManager, room: string, container: StructureContainer, resourceType: ResourceConstant) {
        super(kernel, parent, parent, { room: room, container: container.id, resourceType: resourceType })
        this.memory.room = room
        this.memory.container = container.id
        this.memory.resourceType = resourceType

    }
    getSpawningPriority(): number {
        return 0
    }

    initCreepMemory(): {} {
        return {}
    }

    runCreep(c: Creep): void {
        if (!this.memory.container || !Game.getObjectById(this.memory.container)) this.memory.container = (c.room.find(FIND_MINERALS)[0].pos.findInRange(FIND_STRUCTURES, 1, { filter: (x) => x.structureType == STRUCTURE_CONTAINER })[0] as StructureContainer).id
        if (c.store.getFreeCapacity() > 0) {
            let container = Game.getObjectById(this.memory.container) as StructureContainer
            if (c.withdraw(container, this.memory.resourceType) == ERR_NOT_IN_RANGE) {
                c.moveTo(container)
            }
        } else {
            let storage = Game.rooms[this.memory.room].storage
            if (!storage) return
            if (storage.store[this.memory.resourceType as ResourceConstant] > 100000) {
                let terminal = Game.rooms[this.memory.room].terminal
                if (!terminal) return
                if (c.transfer(terminal, this.memory.resourceType) == ERR_NOT_IN_RANGE) {
                    c.moveTo(terminal)
                }
                return
            }
            if (c.transfer(storage, this.memory.resourceType) == ERR_NOT_IN_RANGE) {
                c.moveTo(storage)
            }
        }
    }
    onCreepDeath(): void { }
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, CARRY, CARRY], 5, [], undefined]
    }
    getType(): string {
        return "MineralHauler"
    }

}

ProcessRegistry.register("MineralHauler", MineralHauler)
