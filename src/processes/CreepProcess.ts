import Process, { ProcessRegistry } from "Process";
import Kernel from "Kernel";
import { spawn } from "child_process";
import { EnergyConsumer } from "../utils/EnergyBalance";
import init from "init";
import RoomManagerProcess from "./RoomManagerProcess";

const ENERGY_CONSUMPTION_ALPHA = 0.0005
abstract class CreepProcess extends Process implements SpawnCallback, EnergyConsumer {
    buffer: number = 0

    constructor(kernel: Kernel, parent: number, spawnManager: number) {
        super(kernel, parent)
        this.memory.spawnManager = spawnManager;
        this.resetEnergyConsumption()
    }

    resetEnergyConsumption(): void {
        this.memory.__energyConsumption = {timeStart: Game.time, energy: 0, lastCall: Game.time}
    }


    getConsumptionTimer(): number {
        return Game.time - this.memory.__energyConsumption.timeStart
    }

    getAverageEnergyConsumption(): number {
        while (this.memory.__energyConsumption.lastCall < Game.time) {
            this.memory.__energyConsumption.lastCall = this.memory.__energyConsumption.lastCall + 1
            this.memory.__energyConsumption.energy = this.memory.__energyConsumption.energy * (1 - ENERGY_CONSUMPTION_ALPHA)
        }
        return this.memory.__energyConsumption.energy
    }

    protected logEnergyConsumption(amount: number) {
        if (!this.buffer) this.buffer = 0
        this.buffer += amount
    }

    private flushEnergyConsumption(): void {
        if (!this.buffer) this.buffer = 0
        if (this.buffer > 1000) {
            console.log("WARNING: Energy for " + this.getPID() + " is " + this.buffer)
        }
        if(!this.memory.__energyConsumption.energy) this.resetEnergyConsumption()
        while (this.memory.__energyConsumption.lastCall < Game.time) {
            this.memory.__energyConsumption.lastCall = this.memory.__energyConsumption.lastCall + 1
            this.memory.__energyConsumption.energy = this.memory.__energyConsumption.energy * (1 - ENERGY_CONSUMPTION_ALPHA)
        }
       this.memory.__energyConsumption.energy = this.memory.__energyConsumption.energy + this.buffer * ENERGY_CONSUMPTION_ALPHA
       this.buffer = 0
    }


    onCreepSpawned(name: string, callbackValues: any): void {
        this.memory.__creeps.push({
            name: name,
            ratioCount: callbackValues.scale,
            memory: {}
        })
        this.memory.__spawningRatio -= callbackValues.scale
        this.sleepUntil = 0;
    }

    getAliveScale():number {
        return _.sum(_.map(this.memory.__creeps, (c: any) => c.ratioCount))
    }

    orderCreepParts(body: BodyPartConstant[]): BodyPartConstant[] {
        return body.sort((a: BodyPartConstant, b: BodyPartConstant): number => {
            if(a == TOUGH && b != TOUGH) return -1
            if (b == TOUGH && a != TOUGH) return 1
            return 0
        })
    }

    abstract getSpawningPriority(): number;

    run() {
        if (!this.kernel.getProcess(this.memory.spawnManager)) {
            this.shutdown()
            return
        }
        if (this.memory.__spawningRatio < 0) {
            this.memory.__spawningRatio = 0
            console.log("Time: " + Game.time + " WARNING: Spawning Ratio of " + this.getPID() + " is below 0")
        }
        if (!this.memory.__creeps) {
            this.memory.__creeps = []
        }
        if (this.memory.__shuttingDown) {
            this.memory.__creeps = _.filter(this.memory.__creeps, (c: any) => c.name in Game.creeps)
            for (let creep of this.memory.__creeps) {
                Game.creeps[creep.name].suicide()
            }
            if (this.memory.__creeps.length == 0) this.kernel.killProcess(this.getPID())
            return
        }
        let [ratio, targetScale, baseparts, maxCreeps] = this.generateSpawnRequest()
        let aliveRatio = 0
        this.memory.__creeps = _.filter(this.memory.__creeps, (c: any) => c.name in Game.creeps)
        for (let x = 0; x < this.memory.__creeps.length ; x++) {
            let creepObject = this.memory.__creeps[x]
            aliveRatio += creepObject.ratioCount;
            if (!Game.creeps[creepObject.name].spawning) {
                this.runCreep(Game.creeps[creepObject.name], creepObject.memory);
            }
        }
        if (aliveRatio > targetScale && this.memory.__spawningRatio > 0) {
            (this.kernel.getProcess(this.memory.spawnManager)! as unknown as SpawnManager).cancelSpawn(this.getPID())
            this.memory.__spawningRatio = 0
        }
        if(this.memory.__spawningRatio && this.memory.__spawningRatio > 0) aliveRatio += this.memory.__spawningRatio;
        if (aliveRatio < targetScale && (!maxCreeps || maxCreeps > this.memory.__creeps.length)) {
            let maxEnergyPerCreep = (this.kernel.getProcess(this.memory.spawnManager)! as unknown as SpawnManager).getMaxEnergy()
            let creepBodys = this.generateNeededCreeps(baseparts? baseparts : [], ratio, targetScale, aliveRatio, maxEnergyPerCreep, maxCreeps? (maxCreeps - this.memory.__creeps.length): undefined)

            for (let creep of creepBodys) {
                (this.kernel.getProcess(this.memory.spawnManager)! as unknown as SpawnManager).addToQueue(creep[0],this.getSpawningPriority(),this,{scale: creep[1]})
                this.logEnergyConsumption(_.sum(_.map(creep[0], (part) => BODYPART_COST[part])))
                this.memory.__spawningRatio += creep[1]
            }
        }
        this.flushEnergyConsumption()
    }

    generateNeededCreeps(baseparts: BodyPartConstant[], ratio: BodyPartConstant[], targetScale: number, currentScale: number, maxEnergy: number, maxNewCreeps: number | undefined): [BodyPartConstant[], number][] {
            let ratioCost = _.sum(_.map(ratio, (part) => BODYPART_COST[part]))
            let baseCost = _.sum(_.map(baseparts, (part) => BODYPART_COST[part]))
            let creeps: [BodyPartConstant[], number][] = []
            let hadScale = 0
            let neededScale = targetScale - currentScale
            while (hadScale < neededScale) {
                let usedEnergy = baseCost
                let creepBody: BodyPartConstant[] = []
                if (baseparts) {
                    creepBody = creepBody.concat(baseparts)
                }
                let thisCreepScale = 0
                while (usedEnergy + ratioCost <= maxEnergy && thisCreepScale < targetScale && creepBody.length + ratio.length <= 50) {
                    creepBody = creepBody.concat(ratio)
                    usedEnergy += ratioCost
                    hadScale++;
                    thisCreepScale++;
                }
                if (usedEnergy == 0) {
                    break;
                }
                creeps.push([this.orderCreepParts(creepBody), thisCreepScale])
                if (maxNewCreeps && creeps.length >= maxNewCreeps) {
                    break
                }
            }
        return creeps;
    }

    abstract runCreep(c: Creep, creepMemory: any): void;

    abstract onCreepDeath(): void;

    abstract generateSpawnRequest(): [ratio: BodyPartConstant[], targetScale: number, baseparts: (BodyPartConstant[] | undefined), maxCreeps: (number | undefined)];

    static scaleRatio(ratio: BodyPartConstant[], maxEnergy: number, maxScale: number): BodyPartConstant[] { //TODO: refactor this method into a utils file and make the maxScale optional
        let totalEnergy = 0;
        let energyPerRatio = _.sum(_.map(ratio, (filter) => BODYPART_COST[filter]))
        let scale = 0;
        let reuturnedBody: BodyPartConstant[] = []
        while(true) {
            totalEnergy += energyPerRatio
            for (let x of ratio) {
                reuturnedBody.push(x)
            }
            scale += 1
            if (scale >= maxScale) break;
            if (totalEnergy + energyPerRatio > maxEnergy) break;
        }
        return reuturnedBody;
    }

    shutdown(): void {
        if (this.kernel.getProcess(this.memory.spawnManager)) (this.kernel.getProcess(this.memory.spawnManager)! as unknown as SpawnManager).cancelSpawn(this.getPID())
        this.memory.__shuttingDown = true
    }

    park(c: Creep): boolean {
        let initProc: init = this.kernel.getProcess(0)! as init;
        let roomMgrID = initProc.getRoomManager(c.room.name);
        if (roomMgrID) {
            let roomMgrProc = this.kernel.getProcess(roomMgrID) as RoomManagerProcess;
            return roomMgrProc.park(c);
        }
        return true;
    }
}

export default CreepProcess;
