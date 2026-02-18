import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";

export default class TowerProcess extends Process {

    constructor(kernel: Kernel, parent: number, tower: StructureTower) {
        super(kernel, parent)
        this.memory.tower = tower.id
    }
    run(): void {
        let tower = Game.getObjectById(this.memory.tower) as StructureTower
        if (!tower) {
            this.shutdown()
            return
        }
        let room = tower.room
        let enemys = room.find(FIND_HOSTILE_CREEPS)
        if (enemys.length > 0) {
            tower.attack(enemys[0])
            return
        }
        let damagedCreeps = room.find(FIND_MY_CREEPS, { filter: (c: Creep) => c.hits < c.hitsMax })
        if (damagedCreeps.length > 0) {
            tower.heal(damagedCreeps[0])
        }
        let dangerouslyDecayedStructures = Game.rooms[tower.pos.roomName].find(FIND_STRUCTURES, {
            filter: function (x: Structure) {
                return (x.structureType == STRUCTURE_ROAD && x.hits < ROAD_DECAY_AMOUNT*2 ) || (x.structureType == STRUCTURE_RAMPART && x.hits < RAMPART_DECAY_AMOUNT*4)
            }
        })
        if (dangerouslyDecayedStructures.length > 0 && tower.store[RESOURCE_ENERGY] > 500) {
            tower.repair(dangerouslyDecayedStructures[0])
        }

    }
    getType(): string {
        return "TowerProcess"
    }

}

ProcessRegistry.register("TowerProcess", TowerProcess)
