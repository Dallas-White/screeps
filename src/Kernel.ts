import { createDiffieHellman } from "crypto"
import Process, { ProcessRegistry } from "./Process"

const MAX_BUCKET = 10000
const BUCKET_FLOOR = 3000
const BUCKET_CRITICAL = 1000

export const PROFILER_ALPHA = 0.00001
export default class Kernel {
    pid_counter: number = 0
    processes: Map<number, Process> = new Map();
    getAcceptableCPUUsage(): number {
        if (!Game.cpu.limit) return Infinity //If this code is in a simulation
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
        if (!Memory.processes) return
        this.pid_counter = Memory.pid_counter ? Memory.pid_counter : 0
        for (let pid of Object.keys(Memory.processes)) {
            this.processes.set(+pid, ProcessRegistry.deserialize(Memory.processes[+pid], this))
        }
    }

    serializeProcesses() {
        Memory.processes = {}
        for (let pid of this.processes.keys()) {
            let serialized = this.processes.get(pid)!.serialize();
            serialized.children = serialized.children.filter((x) => this.processes.get(x))
            Memory.processes[pid] = serialized
        }
        Memory.pid_counter = this.pid_counter
    }

    runProcesses() {
        let cpuLimit = this.getAcceptableCPUUsage();
        let processList = Array.from(this.processes.values()).sort((a, b) => ((a.lastRan) - (b.lastRan)));
        let ProcesssUsed: { [key: string]: number } = {}
        if (!Memory.profilingData) Memory.profilingData = {}
        while (Game.cpu.getUsed() < cpuLimit) {
            let currentProcess = processList.pop();
            if (!currentProcess) break;
            if (currentProcess?.sleepUntil > Game.time) continue;
            if (currentProcess.getAverageCPUUsage() + Game.cpu.getUsed() > cpuLimit) continue
            let beforeUsage = Game.cpu.getUsed()
            try {
                currentProcess.run()
            } catch (e) {
                console.log("Error caught in PID: " + currentProcess.getPID())
                console.log(e)
                console.log((e as Error).stack)
            }
            let processUsage = Game.cpu.getUsed() - beforeUsage
            currentProcess.updateAverageCPUUsage(processUsage)
            if (!ProcesssUsed[currentProcess.getType()]) {
                ProcesssUsed[currentProcess.getType()] = processUsage;
            } else {

                ProcesssUsed[currentProcess.getType()] += processUsage;
            }
            currentProcess.lastRan = Game.time;
        }

        let totalUsage = Game.cpu.getUsed()
        for (let x of Object.values(ProcesssUsed)) {
            totalUsage -= x
        }
        ProcesssUsed["kernelOverhead"] = totalUsage
        for (let x of Object.keys(ProcesssUsed)) {
            if (!Memory.profilingData[x]) {
                Memory.profilingData[x] = { averageCPU: ProcesssUsed[x], lastRan: Game.time }
            } else {
                if (Memory.profilingData[x].lastRan < Game.time) {
                    Memory.profilingData[x].averageCPU =
                        Memory.profilingData[x].averageCPU *
                        ((1 - PROFILER_ALPHA) ** (Game.time - Memory.profilingData[x].lastRan))
                    Memory.profilingData[x].lastRan = Game.time
                }
                Memory.profilingData[x].averageCPU += ProcesssUsed[x] * PROFILER_ALPHA
            }
        }
    }

    runKernel() {
        this.deserializeProcesses();
        this.runProcesses()
    }

    addProcess<T extends Process>(p: T): Pid<T> {
        this.processes.set(p.getPID(), p)
        this.processes.get(p.getParent().getPID())?.children.push(p.getPID())
        return p.getPID()
    }

    killProcess(pid: Pid) {
        let process = this.processes.get(pid)
        if (!process) return
        for (let child of process!.getChildren()) {
            this.killProcess(child)
        }
        this.processes.get(process.getParent().getPID())?.removeChild(pid)
        this.processes.delete(pid)

    }

    shutdownProcess(pid: Pid) {
        this.processes.get(pid)?.shutdown()
    }

    getProcess<T extends Process>(pid: Pid<T>): T | undefined {
        return this.processes.get(pid) as T
    }

    getNumberOfProcesses(): number {
        return this.processes.size;
    }

    getAvailablePID(): number {
        return this.pid_counter++
    }








}

