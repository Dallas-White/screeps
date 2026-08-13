import Kernel from "Kernel";
import Process, { ProcessRegistry } from "Process";
import { EnergyConsumer } from "utils/EnergyBalance";
import { CarrierJobFinishedCallback } from "./LogisticsManager";
import RoomManagerProcess from "./RoomManagerProcess";

const ENERGY_CONSUMPTION_ALPHA = 0.0005

interface TowerProcessMemory {
    tower: Id<StructureTower>
    repairing: boolean
    refillJob: LogisticsTaskID | undefined
    energyConsumption: {
        timeStart: number,
        energy: number,
        lastCall: number
    },
}
export default class TowerProcess extends Process<TowerProcessMemory> implements CarrierJobFinishedCallback, EnergyConsumer {
    buffer: number = 0;
    resetEnergyConsumption(): void {
        this.memory.energyConsumption = { timeStart: Game.time, energy: 0, lastCall: Game.time }
    }


    getConsumptionTimer(): number {
        return Game.time - this.memory.energyConsumption.timeStart
    }

    getAverageEnergyConsumption(): number {
        while (this.memory.energyConsumption.lastCall < Game.time) {
            this.memory.energyConsumption.lastCall = this.memory.energyConsumption.lastCall + 1
            this.memory.energyConsumption.energy = this.memory.energyConsumption.energy * (1 - ENERGY_CONSUMPTION_ALPHA)
        }
        return this.memory.energyConsumption.energy
    }

    protected logEnergyConsumption(amount: number) {
        if (!this.buffer) this.buffer = 0
        this.buffer += amount
    }
    constructor(kernel: Kernel, parent: RoomManagerProcess, tower: StructureTower) {
        super(kernel, parent, {
            tower: tower.id,
            repairing: false,
            refillJob: undefined,
            energyConsumption: {
                timeStart: Game.time,
                energy: 0,
                lastCall: Game.time
            }
        })

    }

    onCarrierJobFinished(id: LogisticsTask): void {
        this.memory.refillJob = undefined
    }

    private flushEnergyConsumption(): void {
        if (!this.buffer) this.buffer = 0
        if (this.buffer > 1000) {
            console.log("WARNING: Energy for " + this.getPID() + " is " + this.buffer)
        }
        if (!this.memory.energyConsumption.energy) this.resetEnergyConsumption()
        while (this.memory.energyConsumption.lastCall < Game.time) {
            this.memory.energyConsumption.lastCall = this.memory.energyConsumption.lastCall + 1
            this.memory.energyConsumption.energy = this.memory.energyConsumption.energy * (1 - ENERGY_CONSUMPTION_ALPHA)
        }
        this.memory.energyConsumption.energy = this.memory.energyConsumption.energy + this.buffer * ENERGY_CONSUMPTION_ALPHA
        this.buffer = 0
    }

    run(): void {
        let tower = Game.getObjectById(this.memory.tower) as StructureTower
        if (!tower) {
            this.shutdown()
            return
        }
        if (tower.store.getFreeCapacity(RESOURCE_ENERGY) > 400) {
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
            this.logEnergyConsumption(10)
            return
        }
        let damagedCreeps = room.find(FIND_MY_CREEPS, { filter: (c: Creep) => c.hits < c.hitsMax })
        if (damagedCreeps.length > 0) {
            tower.heal(damagedCreeps[0])
            this.logEnergyConsumption(10)
        }
        if ((this.memory.repairing || Game.time % 20 == 0) && tower.store![RESOURCE_ENERGY] > 500) {
            let damagedStrucures = tower.room.find(FIND_STRUCTURES, { filter: (x: Structure) => (x.hits < x.hitsMax && x.structureType != STRUCTURE_RAMPART && x.structureType != STRUCTURE_WALL) || (x.structureType == STRUCTURE_RAMPART && x.hits < RAMPART_DECAY_AMOUNT * 2) })
            if (damagedStrucures.length > 0) {
                let mostDamaged = _.min(damagedStrucures, (x: Structure) => x.hits);
                tower.repair(mostDamaged)
                this.logEnergyConsumption(10);
                this.memory.repairing = true
            } else {
                this.memory.repairing = false;
            }
        }
        this.flushEnergyConsumption()

    }
    getType(): string {
        return "TowerProcess"
    }

}

ProcessRegistry.register("TowerProcess", TowerProcess)
