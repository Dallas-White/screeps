import Process, { ProcessRegistry } from "Process";
import { EnergyConsumer, EnergyProducer } from "utils/EnergyBalance";
import Reserver from "./Reserver";
import BuilderProcess from "./BuilderProcess";
import Kernel from "Kernel";
import HarvesterProcess from "./HarvesterProcess";
import RepairerProcess from "./RepairerProcess";
import AttackCreepProcess from "./combat/AttackCreepProcess";
import PillagerProcess from "./combat/PillagerProecss";
import { SpawnManager } from "SpawnManager";

interface RemoteMinerMemory {
    harvesters: boolean;
    built: boolean;
    builderProc: Pid<BuilderProcess> | undefined;
    repair: Pid<RepairerProcess> | undefined;
    haulersSpawned: boolean;
    defender: Pid<AttackCreepProcess> | undefined;
    reserver: Pid<Reserver> | undefined,
    mineRoom: string
    parentRoom: string
    planned: boolean
}

export default class RemoteMiner extends Process<RemoteMinerMemory> implements EnergyConsumer, EnergyProducer {

    constructor(kernel: Kernel, parent: Process, parentRoom: string, mineRoom: string) {
        super(kernel, parent, {
            harvesters: false,
            built: false,
            builderProc: undefined,
            repair: undefined,
            haulersSpawned: false,
            defender: undefined,
            reserver: undefined,
            mineRoom: mineRoom,
            parentRoom: parentRoom,
            planned: false
        })
        this.memory.parentRoom = parentRoom
        this.memory.mineRoom = mineRoom
    }
    resetEnergyProduction(): void {
        for (let x of this.getChildren()) {
            if (!this.kernel.getProcess(x)) {
                continue
            }
            if ("getEnergyProduced" in this.kernel.getProcess(x)!) {
            }
            if ("getAverageEnergyConsumption" in this.kernel.getProcess(x)!) {
            }
        }
    }
    getProductionTimer(): number {
        return 0
    }
    getAverageEnergyProduction(): number {
        let energySum = 0
        for (let x of this.getChildren()) {
            if (!this.kernel.getProcess(x)) {
                continue
            }
            if ("getEnergyProduced" in this.kernel.getProcess(x)!) {
                energySum += (this.kernel.getProcess(x)! as unknown as EnergyProducer).getAverageEnergyProduction();
            }
        }
        return energySum
    }
    resetEnergyConsumption(): void {
        return
    }
    getConsumptionTimer(): number {
        return 0
    }
    getAverageEnergyConsumption(): number {
        let energySum = 0
        for (let x of this.getChildren()) {
            if (!this.kernel.getProcess(x)) {
                continue
            }
            if ("getAverageEnergyConsumption" in this.kernel.getProcess(x)!) {
                energySum += (this.kernel.getProcess(x)! as unknown as EnergyConsumer).getAverageEnergyConsumption();
            }
        }
        return energySum
    }
    run(): void {
        if (!this.memory.reserver) {
            let reserver = new Reserver(this.kernel, this, this.getParent() as SpawnManager, this.memory.mineRoom);
            this.kernel.addProcess(reserver)
            this.memory.reserver = reserver.getPID()
        }

        if (!Game.rooms[this.memory.mineRoom]) return
        if (!this.memory.harvesters) {
            for (let source of Game.rooms[this.memory.mineRoom].find(FIND_SOURCES)) {
                this.kernel.addProcess(new HarvesterProcess(this.kernel, this, this.getParent() as SpawnManager, source))
            }
            this.memory.harvesters = true
        }
        if (!this.memory.planned) {
            let exit = Game.rooms[this.memory.mineRoom].find(Game.rooms[this.memory.mineRoom].findExitTo(this.memory.parentRoom) as ExitConstant)
            let failed = false
            let controller_path = PathFinder.search(Game.rooms[this.memory.mineRoom].controller!.pos, exit)
            for (let p of controller_path.path) {
                if (Game.rooms[this.memory.mineRoom].createConstructionSite(p.x, p.y, STRUCTURE_ROAD) == ERR_FULL) failed = true
            }
            for (let source of Game.rooms[this.memory.mineRoom].find(FIND_SOURCES)) {
                let path = PathFinder.search(source.pos, exit);
                let container = path.path.shift()!
                let construct_result = Game.rooms[this.memory.mineRoom].createConstructionSite(container.x, container.y, STRUCTURE_CONTAINER)
                if (construct_result == ERR_FULL) {
                    failed = true
                }
                for (let pos of path.path) {
                    let construct_result = Game.rooms[this.memory.mineRoom].createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD)
                    if (construct_result == ERR_FULL) {
                        failed = true
                    }
                }
            }
            if (failed) {
                this.sleep(1000)
                return
            }
        }
        if (!this.memory.built && (!this.memory.builderProc || !this.kernel.getProcess(this.memory.builderProc))) {

            let constructionProcess = new BuilderProcess(this.kernel, this, this.getParent() as SpawnManager, this.memory.mineRoom)
            this.kernel.addProcess(constructionProcess)
            this.memory.planned = true;
            this.memory.builderProc = constructionProcess.getPID()
        }
        if (!this.memory.repair) {
            let repairProc = new RepairerProcess(this.kernel, this, this.getParent() as SpawnManager, this.memory.mineRoom)
            this.kernel.addProcess(repairProc)
            this.memory.repair = repairProc.getPID()
        }
        if (!this.memory.haulersSpawned && Game.rooms[this.memory.mineRoom].find(FIND_CONSTRUCTION_SITES).length == 0) {
            this.memory.built = true;
            let containers = Game.rooms[this.memory.mineRoom].find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_CONTAINER })
            for (let container of containers) {
                this.kernel.addProcess(new PillagerProcess(this.kernel, this, this.getParent() as SpawnManager, this.memory.mineRoom, this.memory.parentRoom, 7));
            }
            this.memory.haulersSpawned = true
        }
        if (Game.rooms[this.memory.mineRoom].find(FIND_HOSTILE_CREEPS).length > 0 || Game.rooms[this.memory.mineRoom].find(FIND_HOSTILE_STRUCTURES).length > 0) {
            let hostileAttackParts = _.sum(Game.rooms[this.memory.mineRoom].find(FIND_HOSTILE_CREEPS).map((c) => _.sum(_.filter(c.body, (c) => c.type == ATTACK || c.type == HEAL || c.type == RANGED_ATTACK))))
            if (!this.memory.defender) {
                let defenseProcess = new AttackCreepProcess(this.kernel, this, this.getParent() as SpawnManager, Math.max(hostileAttackParts * 2, 6), [TOUGH, ATTACK, MOVE], this.memory.mineRoom, undefined)
                this.memory.defender = defenseProcess.getPID()
                this.kernel.addProcess(defenseProcess)
            }
            let defenseProcess = this.kernel.getProcess(this.memory.defender)! as AttackCreepProcess
            if (defenseProcess.getScale() < hostileAttackParts * 3) {
                defenseProcess.setScale(hostileAttackParts * 3)
            }
        } else if (this.memory.defender) {
            this.kernel.getProcess(this.memory.defender)?.shutdown()
            this.memory.defender = undefined
        }




    }
    getType(): string {
        return "RemoteMiner"
    }

}

ProcessRegistry.register("RemoteMiner", RemoteMiner)
