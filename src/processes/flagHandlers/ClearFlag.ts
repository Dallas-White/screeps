import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { SpawnManager } from "SpawnManager";

interface ClearCreepMemory {
    target: Id<_HasId> | undefined;
}


export default class ClearFlag extends CreepProcess<{ room: string }, ClearCreepMemory> {
    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, flag: Flag) {
        super(kernel, parent, spawnManager, { room: flag.pos.roomName })
    }

    getSpawningPriority(): number {
        return 0;
    }

    runCreep(c: Creep, creepMemory: ClearCreepMemory): void {
        if (c.room.name != this.memory.room) {
            c.moveTo(new RoomPosition(25, 25, this.memory.room))
            return;
        }
        if (!creepMemory.target || !Game.getObjectById(creepMemory.target)) {
            let closestTarget = c.pos.findClosestByRange(FIND_STRUCTURES, { filter: (s) => s.structureType != STRUCTURE_CONTROLLER }) as _HasId;
            if (!closestTarget) this.shutdown()
            creepMemory.target = closestTarget.id;
        }
        let target = Game.getObjectById(creepMemory.target)! as Structure;
        let dismantleResult = c.dismantle(target)
        if (dismantleResult == ERR_NOT_IN_RANGE) {
            c.moveTo(target)
        } else if (dismantleResult != OK) {
            creepMemory.target = undefined
        }

    }

    initCreepMemory(): ClearCreepMemory {
        return {
            target: undefined
        }
    }

    onCreepDeath(): void { }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, WORK, WORK], 5, [], undefined]
    }
    getType(): string {
        return "ClearCreep"
    }

}

ProcessRegistry.register("ClearCreep", ClearFlag);