import { moveToRoom } from "utils/creepUtils";
import CreepProcess from "./CreepProcess";
import { ProcessRegistry } from "Process";

export default class ScoutProcess extends CreepProcess {

    getSpawningPriority(): number {
        return 0
    }

    setRoom(roomName: string) {
        this.memory.room = roomName
    }

    runCreep(c: Creep, creepMemory: any): void {
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
        } else if (c.memory.pos.x == 49 || c.memory.pos.y == 49 || c.memory.pos.y == 0 || c.memory.pos.y == 49) {
            c.moveTo(25,25)
        }
    }
    onCreepDeath(): void {}
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE], 1,[], undefined]
    }
    getType(): string {
        return "ScoutProcess"
    }
}

ProcessRegistry.register("ScoutProcess", ScoutProcess)
