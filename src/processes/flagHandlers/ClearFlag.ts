import Kernel from "Kernel";
import { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";


export default class ClearFlag extends CreepProcess {
    constructor(kernel: Kernel, parent: number, spawnManager: number, flag: Flag) {
        super(kernel, parent, spawnManager)
        this.memory.room = flag.pos.roomName
    }
    getSpawningPriority(): number {
        return 0;
    }
    runCreep(c: Creep, creepMemory: any): void {
        if (c.room.name != this.memory.room) {
            c.moveTo(new RoomPosition(25, 25, this.memory.room))
            return;
        }
        if (!creepMemory.target || !Game.getObjectById(creepMemory.target)) {
            let closestTarget = c.pos.findClosestByRange(FIND_STRUCTURES) as _HasId;
            if (!closestTarget) this.shutdown()
            creepMemory.target = closestTarget.id;
        }
        let target = Game.getObjectById(creepMemory.target)! as Structure;
        let dismantleResult = c.dismantle(target)
        if (dismantleResult == ERR_NOT_IN_RANGE) {
            c.moveTo(target)
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