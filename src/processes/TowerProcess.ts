import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import { CarrierJobFinishedCallback } from "./LogisticsManager";
import RoomManagerProcess from "./RoomManagerProcess";

interface TowerProcessMemory {
    tower: Id<StructureTower>
    repairing: boolean
    refillJob: LogisticsTaskID | undefined
}
export default class TowerProcess extends Process<TowerProcessMemory> implements CarrierJobFinishedCallback {

    constructor(kernel: Kernel, parent: RoomManagerProcess, tower: StructureTower) {
        super(kernel, parent, {
            tower: tower.id,
            repairing: false,
            refillJob: undefined
        })
    }

    onCarrierJobFinished(id: LogisticsTask): void {
        this.memory.refillJob = undefined
    }

    run(): void {
        let tower = Game.getObjectById(this.memory.tower) as StructureTower
        if (!tower) {
            this.shutdown()
            return
        }
        if (tower.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (!this.memory.refillJob) {
                this.memory.refillJob = (this.getParent() as RoomManagerProcess).getLogisticsManager().addLogisticTask({
                    priority: 1000,
                    amount: tower.store.getFreeCapacity(RESOURCE_ENERGY),
                    source: undefined,
                    dest: tower.id,
                    resource: RESOURCE_ENERGY,
                    callback: this.getPID()
                })
            } else {
                (this.getParent() as RoomManagerProcess).getLogisticsManager().resizeTask(this.memory.refillJob, tower.store.getFreeCapacity(RESOURCE_ENERGY))
            }
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
        if ((this.memory.repairing || Game.time % 20 == 0) && tower.store![RESOURCE_ENERGY] > 500) {
            let damagedStrucures = tower.room.find(FIND_STRUCTURES, { filter: (x: Structure) => (x.hits < x.hitsMax && x.structureType != STRUCTURE_RAMPART && x.structureType != STRUCTURE_WALL) || (x.structureType == STRUCTURE_RAMPART && x.hits < RAMPART_DECAY_AMOUNT * 2) })
            if (damagedStrucures.length > 0) {
                let mostDamaged = _.min(damagedStrucures, (x: Structure) => x.hits);
                tower.repair(mostDamaged)
                this.memory.repairing = true
            } else {
                this.memory.repairing = false;
            }
        }

    }
    getType(): string {
        return "TowerProcess"
    }

}

ProcessRegistry.register("TowerProcess", TowerProcess)
