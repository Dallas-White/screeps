import type Kernel from "Kernel";

const memoryAverageFactor = 0.2

declare global {
    type Pid<T extends Process = Process> = number & Tag.OpaqueTag<T>
}

abstract class Process<T extends Object = {}> {
    private pid: Pid<this>
    private parent: Pid
    kernel: Kernel
    priority: number = 1
    lastRan: number = 0
    sleepUntil: number = 0
    private averageCPUUsage = 0
    children: Pid[] = []
    protected memory: T;

    constructor(kernel: Kernel, parent: Process | 0, memory: T) {
        this.pid = kernel.getAvailablePID() as Pid<this>;
        this.kernel = kernel
        this.parent = parent == 0 ? 0 as Pid : parent.getPID()
        this.memory = memory
    }


    updateAverageCPUUsage(newUsage: number) {
        this.averageCPUUsage = this.averageCPUUsage * (1 - memoryAverageFactor) + newUsage * memoryAverageFactor;
    }

    getAverageCPUUsage() {
        return this.averageCPUUsage;
    }

    getPID(): Pid<this> {
        return this.pid;
    }

    setPID(pid: Pid<this>) {
        this.pid = pid
    }

    shutdown() {
        this.kernel.killProcess(this.pid)
    }

    getKernel(): Kernel {
        return this.kernel;
    }

    abstract run(): void

    abstract getType(): string;

    serialize(): SerializedProcess<T> {
        return {
            pid: this.pid,
            type: this.getType(),
            priority: this.priority,
            lastRan: this.lastRan,
            sleepUntil: this.sleepUntil,
            memory: this.memory,
            children: this.children,
            averageCPUUsage: this.averageCPUUsage,
            parent: this.parent
        };
    }

    loadFromSerialized(data: SerializedProcess<T>, kernel: Kernel) {
        this.pid = data.pid as Pid<this>;
        this.priority = data.priority;
        this.lastRan = data.lastRan;
        this.sleepUntil = data.sleepUntil;
        this.memory = data.memory || {};
        this.kernel = kernel;
        this.children = data.children as Pid[]
        this.averageCPUUsage = data.averageCPUUsage;
        this.parent = data.parent as Pid
    }
    sleep(ticks: number = 0) {
        if (!ticks)
            this.sleepUntil = Number.MAX_SAFE_INTEGER;
        else
            this.sleepUntil = Game.time + ticks;
    }

    getChildren(): Pid<Process>[] {
        return this.children;
    }

    addChild(child: Pid<Process>) {
        this.children.push(child);
    }

    removeChild(child: Pid<Process>) {
        this.children.splice(this.children.indexOf(child), 1)
    }

    getParent(): Process {
        return this.kernel.getProcess(this.parent)!;
    }

}
export default Process


export class ProcessRegistry {
    private static registry = new Map<string, abstract new (...args: any[]) => Process>();

    static register(type: string, cls: abstract new (...args: any[]) => Process) {
        this.registry.set(type, cls);
    }

    static deserialize(data: SerializedProcess<Object>, kernel: Kernel): Process {
        const cls = this.registry.get(data.type);
        if (!cls) {
            throw new Error(`Unknown process type: ${data.type}`);
        }

        // Create instance without calling constructor
        const instance = Object.create(cls.prototype) as Process;
        instance.loadFromSerialized(data, kernel);
        return instance;
    }

}
