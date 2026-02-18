import { moveToRoom } from "utils/creepUtils";
import CreepProcess from "./CreepProcess";
import { ProcessRegistry } from "Process";
import Kernel from "Kernel";

export default class Reserver extends CreepProcess {

    constructor(kernel: Kernel, parent: number, spawnManager: number, room: string) {
        super(kernel, parent, spawnManager)
        this.memory.room = room
    }

    getSpawningPriority(): number {
        return 0
    }
    runCreep(c: Creep, creepMemory: any): void {
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        if (c.reserveController(c.room.controller!)) {
            c.moveTo(c.room.controller!)
        }
    }
    onCreepDeath(): void {}

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, CLAIM], 2, [], undefined]
    }

    getType(): string {
        return "Reserver"
    }

}

ProcessRegistry.register("Reserver", Reserver)
