import Kernel from "Kernel";
import { ProcessRegistry } from "Process";
import CreepProcess from "processes/CreepProcess";
import { moveToRoom } from "utils/creepUtils";


export default class HealingProcess extends CreepProcess {
    constructor(kernel: Kernel, parent: number, spawnManager: number, scale: number, ratio: BodyPartConstant[], room: string, object: AnyCreep | Structure | undefined) {
        super(kernel, parent, spawnManager)
        this.memory.room = room
        this.memory.scale = scale;
        this.memory.ratio = ratio;
        this.memory.object = object
    }

    setScale(n: number) {
        this.memory.scale = n
    }

    getSpawningPriority(): number {
        return 10000
    }
    runCreep(c: Creep, creepMemory: any): void {
        if(c.hits < c.hitsMax) c.heal(c)
        if (c.room.name != this.memory.room) {
            moveToRoom(c, this.memory.room)
            return
        }
        let target = c.pos.findClosestByPath(FIND_MY_CREEPS, { filter: (target) => target.hits < target.hitsMax })
        if (!target) target = c.pos.findClosestByPath(FIND_MY_CREEPS)
        if (!target) return;
        c.moveTo(target)
        if(target.hits < target.hitsMax) c.heal(target)
    }
    onCreepDeath(): void {}
    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [this.memory.ratio, this.memory.scale, [], undefined]
    }
    getType(): string {
        return "HealingProcess"
    }
}
ProcessRegistry.register("HealingProcess", HealingProcess)
