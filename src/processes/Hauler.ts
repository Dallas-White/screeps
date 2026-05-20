import Kernel from "Kernel";
import CreepProcess from "./CreepProcess";
import { moveToRoom } from "utils/creepUtils";
import Process, { ProcessRegistry } from "Process";
import { SpawnManager } from "SpawnManager";

interface HaulerProcessMemory {
    source: string,
    destination: string,
    priority: number,
    scale: number,
    amount: number | undefined,
    resource: ResourceConstant
}

export default class Hauler extends CreepProcess<HaulerProcessMemory> {


    constructor(kernel: Kernel, parent: Process, spawnManager: SpawnManager, source: string, destination: string, priority: number, scale: number, resource: ResourceConstant, amount: number | undefined) {
        super(kernel, parent, spawnManager, {
            source: source,
            destination: destination,
            priority: priority,
            scale: scale,
            amount: amount,
            resource: resource
        })
        this.memory.source = source;
        this.memory.destination = destination;
        this.memory.priority = priority
        this.memory.scale = scale
        this.memory.amount = amount;
        this.memory.resource = resource
    }

    getSpawningPriority(): number {
        return this.memory.priority
    }
    runCreep(c: Creep): void {
        if (c.store.getFreeCapacity() > 0) {
            let source = Game.getObjectById(this.memory.source) as Structure
            if (!source) return
            if (source.pos.roomName != c.room.name) {
                moveToRoom(c, source.pos.roomName);
                return
            }
            if (c.withdraw(source, this.memory.resource) == ERR_NOT_IN_RANGE) {
                c.moveTo(source)
            }
        } else {
            let destination = Game.getObjectById(this.memory.destination) as Structure
            if (!destination) c.drop(this.memory.resource);
            if (destination.pos.roomName != c.room.name) {
                moveToRoom(c, destination.pos.roomName);
                return
            }
            let transfer_result = c.transfer(destination, this.memory.resource)
            if (transfer_result == ERR_NOT_IN_RANGE) {
                c.moveTo(destination)
            } else if (transfer_result == OK) {
                if (this.memory.amount) {
                    this.memory.amount -= c.store.getFreeCapacity()
                    if (this.memory.amount <= 0) this.shutdown()
                }
            }
        }
    }

    onCreepDeath(): void { }

    initCreepMemory(): {} {
        return {}
    }

    generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)] {
        return [[MOVE, CARRY, CARRY], this.memory.scale, [], undefined]
    }

    getType(): string {
        return "Hauler"
    }

}

ProcessRegistry.register("Hauler", Hauler)
