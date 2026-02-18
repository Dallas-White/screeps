import { createDiffieHellman } from "crypto"
import Process, {ProcessRegistry} from "./Process"

const MAX_BUCKET = 10000
const BUCKET_FLOOR = 3000
const BUCKET_CRITICAL = 1000

export const PROFILER_ALPHA = 0.00001
export default class Kernel {
    pid_counter:number  = 0
    processes: Map<number, Process> = new Map();
    getAcceptableCPUUsage(): number {
        if(!Game.cpu.limit) return Infinity //If this code is in a simulation
        let limit = Game.cpu.limit
        if (Game.cpu.bucket >= BUCKET_FLOOR) {
            limit = limit + 500
        } else if (Game.cpu.bucket <= BUCKET_CRITICAL) {
            limit = limit / 2
        }
        return limit
    }

    deserializeProcesses() {
        this.processes = new Map();
        if(!Memory.processes) return
        this.pid_counter = Memory.pid_counter? Memory.pid_counter : 0
        for (let pid of Object.keys(Memory.processes)) {
            this.processes.set(+pid,ProcessRegistry.deserialize(Memory.processes[+pid], this))
        }
    }

    serializeProcesses() {
        Memory.processes = {}
        for (let pid of this.processes.keys()) {
            let serialized = this.processes.get(pid)!.serialize();
            serialized.children = serialized.children.filter((x) => this.processes.get(x))
            if (!serialized.parent) {
                for (let x in Memory.processes) {
                    if (Memory.processes[x].children.filter((y) => y == pid).length > 0) {
                        serialized.parent = Memory.processes[x].pid
                        break
                    }
                }
            }
            Memory.processes[pid] = serialized
        }
        Memory.pid_counter = this.pid_counter
    }

    runProcesses() {
        let cpuLimit = this.getAcceptableCPUUsage();
        let processList = Array.from(this.processes.values()).sort((a, b) => (a.priority + (Game.time - a.lastRan) - (b.priority + (Game.time - b.lastRan))));
        while(Game.cpu.getUsed() < cpuLimit) {
            let currentProcess = processList.pop();
            if (!currentProcess) break;
            if (currentProcess?.sleepUntil > Game.time) continue;
            if(currentProcess.getAverageCPUUsage() + Game.cpu.getUsed() > cpuLimit) continue
            let beforeUsage = Game.cpu.getUsed()
            try {
                currentProcess.run()
            } catch(e) {
                console.log(e)
                console.log((e as Error).stack)
            }
            let processUsage = Game.cpu.getUsed() - beforeUsage
            currentProcess.updateAverageCPUUsage(processUsage)
            if(!Memory.profilingData) Memory.profilingData = {}
            if (!Memory.profilingData[currentProcess.getType()]) {
                Memory.profilingData[currentProcess.getType()] = {averageCPU: processUsage, lastRan: Game.time}
            } else {
                if (Memory.profilingData[currentProcess.getType()].lastRan < Game.time) {
                    Memory.profilingData[currentProcess.getType()].averageCPU =
                        Memory.profilingData[currentProcess.getType()].averageCPU *
                        ((1-PROFILER_ALPHA) ** (Game.time - Memory.profilingData[currentProcess.getType()].lastRan))
                    Memory.profilingData[currentProcess.getType()].lastRan = Game.time
                }
                Memory.profilingData[currentProcess.getType()].averageCPU += processUsage * PROFILER_ALPHA
            }
            currentProcess.lastRan = Game.time;
        }
    }

    runKernel() {
        this.deserializeProcesses();
        this.runProcesses()
    }

    addProcess(p: Process) {
        this.processes.set(p.getPID(), p)
        this.processes.get(p.getParent())?.children.push(p.getPID())
    }

    killProcess(pid: number) {
        let process = this.processes.get(pid)
        if(!process) return
        for (let child of process!.getChildren()) {
            this.processes.get(child)?.shutdown()
        }
        this.processes.get(this.processes.get(pid)?.getParent()!)?.removeChild(pid)
        this.processes.delete(pid)

    }

    shutdownProcess(pid: number) {
        this.processes.get(pid)?.shutdown()
    }

    getProcess(pid: number): Process | undefined {
        return this.processes.get(pid)
    }

    getNumberOfProcesses(): number {
        return this.processes.size;
    }

    getAvailablePID(): number {
        return this.pid_counter++
    }








}

