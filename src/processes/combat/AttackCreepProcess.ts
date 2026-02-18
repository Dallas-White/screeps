import Kernel from "Kernel";
import { object } from "lodash";
import { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { moveToRoom } from "utils/creepUtils";

export default class AttackCreepProcess extends CreepProcess {

    constructor(kernel: Kernel, parent: number, spawnManager: number, scale: number, ratio: BodyPartConstant[], room: string, object: AnyCreep | Structure | undefined) {
        super(kernel, parent, spawnManager)
        this.memory.room = room
        this.memory.scale = scale;
        this.memory.ratio = ratio;
        this.memory.object = object
    }
    setScale(scale: number) {
        this.memory.scale = scale
    }

    getScale(): number {
        return this.memory.scale
    }

    setRatio(ratio: BodyPartConstant[]) {
        this.memory.ratio = ratio
    }

    getSpawningPriority(): number {
        return 10000
    }
    runCreep(c: Creep, creepMemory: any): void {
        if (this.memory.room && c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        let target = Game.getObjectById(this.memory.object) as AnyCreep | Structure | null
        if (!target || target == null) {
            if (this.memory.object) {
                this.memory.object == null
            }
            target = c.pos.findClosestByPath(FIND_HOSTILE_CREEPS)
            if(!target) target = c.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES)
        }
        if (!target)  return
        if (c.attack(target as AnyCreep | Structure) == ERR_NOT_IN_RANGE) {
            c.moveTo(target)
        }
    }

    onCreepDeath(): void {}
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [this.memory.ratio, this.memory.scale, [], undefined]
    }
    getType(): string {
        return "AttackCreep"
    }

}

ProcessRegistry.register("AttackCreep",AttackCreepProcess)
