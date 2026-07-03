import init from "init"
import Kernel from "Kernel"
import { assign } from "lodash"
import Process, { ProcessRegistry } from "Process"
import { CarrierJobFinishedCallback } from "processes/LogisticsManager"
import RoomManagerProcess from "processes/RoomManagerProcess"
import { heapPop, heapPush } from "utils/heap"

export enum TerminalTaskType {
    BUY = 0,
    SELL = 1,
}


type TerminalBuyTask = {
    taskType: TerminalTaskType.BUY,
    resource: ResourceConstant
    amount: number
    priority: number
}

type TerminalSellTask = {
    taskType: TerminalTaskType.SELL,
    resource: ResourceConstant,
    amount: number
    priority: number
}

export type TerminalTask = TerminalBuyTask | TerminalSellTask


export type TerminalTaskID = number & Tag.OpaqueTag<TerminalTask>

type StoredTerminalTask = {
    task: TerminalTask
    id: TerminalTaskID
    done: number
    callback: Pid<TerminalTaskCallback>
    assigned: number
    priority: number
}

type TerminalAssignment = {
    taskID: TerminalTaskID,
    priority: number
    amount: number
    assignmentID: number
}

type TerminalManagerMemory = {
    terminal: Id<StructureTerminal>,
    capacityAvailable: number,
    tasks: Record<TerminalTaskID, StoredTerminalTask>
    capacityQueue: Array<{ priority: number, task: TerminalTaskID }>
    pendingOrders: Array<{ assignment: TerminalAssignment, orderId: string }>
    assignmentsLogisticsTracker: Record<LogisticsTaskID, TerminalAssignment>
    assignmentTransferQueue: Array<TerminalAssignment>
    dealQueue: Array<TerminalAssignment>
    assignmentRecieverQueue: Record<number, TerminalAssignment>
    assignmentIDCounter: number
    refillRequest: LogisticsTaskID | undefined
}

export interface TerminalTaskCallback extends Process {
    onTaskDone(t: TerminalTask, id: TerminalTaskID): void
}

const MIN_TERMINAL_BATCH_AMOUNT = 10000
const ENERGY_FEE_RESERVE = 10000
const MAX_ASSIGNMENT_SIZE = 10000
export class TerminalManager extends Process<TerminalManagerMemory> implements CarrierJobFinishedCallback {
    constructor(kernel: Kernel, parent: RoomManagerProcess, terminal: StructureTerminal) {
        super(kernel, parent, {
            terminal: terminal.id,
            capacityQueue: [],
            capacityAvailable: terminal.store.getFreeCapacity() - ENERGY_FEE_RESERVE,
            tasks: {},
            pendingOrders: [],
            assignmentTransferQueue: [],
            dealQueue: [],
            assignmentRecieverQueue: {},
            assignmentsLogisticsTracker: {},
            assignmentIDCounter: 0,
            refillRequest: undefined
        })
    }
    onCarrierJobFinished(task: LogisticsTask, id: LogisticsTaskID): void {
        let logisticsAssignment = this.memory.assignmentsLogisticsTracker[id];
        if (!logisticsAssignment) {
            if (id == this.memory.refillRequest)
                this.memory.refillRequest = undefined
            return
        }
        let terminalTask = this.memory.tasks[logisticsAssignment.taskID];
        if (terminalTask.task.taskType == TerminalTaskType.SELL) {
            heapPush(this.memory.dealQueue, logisticsAssignment)
        } else if (terminalTask.task.taskType == TerminalTaskType.BUY) {
            terminalTask.done += logisticsAssignment.amount
            if (terminalTask.done >= terminalTask.task.amount) {
                if (terminalTask.callback != undefined) {
                    this.kernel.getProcess(terminalTask.callback)?.onTaskDone(terminalTask.task, terminalTask.id)
                }
                delete this.memory.tasks[terminalTask.id];
            }
        }
        delete this.memory.assignmentsLogisticsTracker[id]
    }

    addTask(task: TerminalTask, callback: Pid<TerminalTaskCallback>, priority: number): TerminalTaskID {
        let taskId = Memory.terminaltaskIDCounter++ as TerminalTaskID
        this.memory.tasks[taskId] = {
            task: task,
            id: taskId,
            callback: callback,
            priority: priority,
            done: 0,
            assigned: 0
        }
        heapPush(this.memory.capacityQueue, { priority: priority, task: taskId })
        return taskId
    }
    run(): void {
        let terminal = Game.getObjectById(this.memory.terminal)
        if (!terminal) {
            this.shutdown();
            return;
        }
        if (terminal.store[RESOURCE_ENERGY] < ENERGY_FEE_RESERVE) {
            let logisticsManager = (this.getParent() as RoomManagerProcess).getLogisticsManager()
            if (this.memory.refillRequest)
                logisticsManager.resizeTask(this.memory.refillRequest, ENERGY_FEE_RESERVE - terminal.store[RESOURCE_ENERGY])
            else
                this.memory.refillRequest = logisticsManager.addLogisticTask({
                    priority: 1000,
                    amount: ENERGY_FEE_RESERVE - terminal.store[RESOURCE_ENERGY],
                    source: undefined,
                    dest: terminal.id,
                    resource: "energy",
                    callback: this.getPID()
                })
        }
        let clearedOrders: TerminalAssignment[] = []
        for (let order of this.memory.pendingOrders) {
            if (this.memory.tasks[order.assignment.taskID].task.taskType == TerminalTaskType.BUY) {
                for (let po of Game.market.incomingTransactions) {
                    if (po.order?.id == order.orderId) {
                        clearedOrders.push(order.assignment)
                        break
                    }
                }
            } else {
                for (let po of Game.market.outgoingTransactions) {
                    if (po.order?.id == order.orderId) {
                        clearedOrders.push(order.assignment)
                        break
                    }
                }
            }
        }
        let unclearedOrders = this.memory.pendingOrders.filter((s) => clearedOrders.filter((z) => s.assignment.assignmentID == z.assignmentID).length == 0)
        for (let order of unclearedOrders) {
            heapPush(this.memory.dealQueue, order.assignment)
        }
        this.memory.pendingOrders = []
        for (let order of clearedOrders) {
            if (this.memory.tasks[order.taskID].task.taskType == TerminalTaskType.SELL) {
                this.memory.capacityAvailable += order.amount
                this.memory.tasks[order.taskID].done += order.amount
                if (this.memory.tasks[order.taskID].done >= this.memory.tasks[order.taskID].task.amount) {
                    if (this.memory.tasks[order.taskID].callback != undefined) {
                        this.kernel.getProcess(this.memory.tasks[order.taskID].callback)?.onTaskDone(this.memory.tasks[order.taskID].task, order.taskID)
                    }
                    delete this.memory.tasks[order.taskID]
                }
            } else if (this.memory.tasks[order.taskID].task.taskType == TerminalTaskType.BUY) {
                let taskId = (this.getParent() as RoomManagerProcess).getLogisticsManager().addLogisticTask({
                    priority: this.memory.tasks[order.taskID].priority,
                    amount: order.amount,
                    source: this.memory.terminal,
                    dest: undefined,
                    resource: this.memory.tasks[order.taskID].task.resource,
                    callback: this.getPID()
                })
                this.memory.assignmentsLogisticsTracker[taskId] = order
            }

        }
        while (this.memory.capacityAvailable > 0) {
            let assignmentTaskID = this.memory.capacityQueue[0]
            if (!assignmentTaskID) break
            let currentStoredTask = this.memory.tasks[assignmentTaskID.task]
            let remaining = currentStoredTask.task.amount - currentStoredTask.assigned
            if (remaining > MIN_TERMINAL_BATCH_AMOUNT && this.memory.capacityAvailable < MIN_TERMINAL_BATCH_AMOUNT) break
            let assignmentAmount = Math.min(Math.min(remaining, this.memory.capacityAvailable), MAX_ASSIGNMENT_SIZE)
            switch (currentStoredTask.task.taskType) {
                case TerminalTaskType.BUY:
                    heapPush(this.memory.dealQueue, {
                        taskID: currentStoredTask.id as TerminalTaskID,
                        priority: currentStoredTask.priority,
                        amount: assignmentAmount,
                        assignmentID: this.memory.assignmentIDCounter++
                    })
                    break
                case TerminalTaskType.SELL:
                    let taskId = (this.getParent() as RoomManagerProcess).getLogisticsManager().addLogisticTask({
                        priority: currentStoredTask.priority,
                        amount: assignmentAmount,
                        source: undefined,
                        dest: this.memory.terminal,
                        resource: currentStoredTask.task.resource,
                        callback: this.getPID()
                    })
                    this.memory.assignmentsLogisticsTracker[taskId] = {
                        taskID: currentStoredTask.id as TerminalTaskID,
                        priority: currentStoredTask.priority,
                        amount: assignmentAmount,
                        assignmentID: this.memory.assignmentIDCounter++
                    };
                    break
            }
            this.memory.capacityAvailable -= assignmentAmount
            currentStoredTask.assigned += assignmentAmount
            if (currentStoredTask.assigned >= currentStoredTask.task.amount) {
                heapPop(this.memory.capacityQueue)

            }
        }
        if (this.memory.dealQueue.length > 0 && terminal.cooldown == 0) {
            let deal = this.memory.dealQueue[0]
            let task = this.memory.tasks[deal.taskID]
            if (task.task.taskType == TerminalTaskType.BUY) {
                let cheapestOrder = undefined
                let cheapestPrice = Infinity
                let cheapestTransactionCost = Infinity
                for (let x of Game.market.getAllOrders({ type: ORDER_SELL, resourceType: task.task.resource })) {
                    if (x.amount < deal.amount || x.price > cheapestPrice) {
                        continue
                    }
                    let transactionCost = x.roomName ? Game.market.calcTransactionCost(deal.amount, terminal.room.name, x.roomName) : 0
                    if (cheapestPrice == x.price && cheapestTransactionCost <= transactionCost) {
                        continue
                    }
                    cheapestOrder = x.id
                    cheapestPrice = x.price
                    cheapestTransactionCost = transactionCost
                }
                if (cheapestOrder) {
                    let dealResult = Game.market.deal(cheapestOrder, deal.amount, terminal.room.name)
                    if (dealResult == OK) {
                        heapPop(this.memory.dealQueue)
                        this.memory.pendingOrders.push({ assignment: deal, orderId: cheapestOrder })
                    } else {
                        console.log("Deal Result: " + dealResult)
                    }
                }
            } else if (task.task.taskType == TerminalTaskType.SELL) {
                let mostExpensiveOrder = undefined
                let mostExpensivePrice = 0
                let cheapestTransactionCost = Infinity
                for (let x of Game.market.getAllOrders({ type: ORDER_BUY, resourceType: task.task.resource })) {
                    if (x.amount < deal.amount || x.price < mostExpensivePrice) {
                        continue
                    }
                    let transactionCost = x.roomName ? Game.market.calcTransactionCost(deal.amount, terminal.room.name, x.roomName) : 0
                    if (mostExpensivePrice == x.price && cheapestTransactionCost <= transactionCost) {
                        continue
                    }
                    mostExpensiveOrder = x.id
                    mostExpensivePrice = x.price
                    cheapestTransactionCost = transactionCost
                }
                if (mostExpensiveOrder) {
                    let dealResult = Game.market.deal(mostExpensiveOrder, deal.amount, terminal.room.name)
                    if (dealResult == OK) {
                        heapPop(this.memory.dealQueue)
                        this.memory.pendingOrders.push({ assignment: deal, orderId: mostExpensiveOrder })
                    } else {
                        console.log("Deal Result: " + dealResult)
                    }
                } else {
                    console.log("No Deal Found")
                }
            }
        }
    }

    getType(): string {
        return "terminalManager"
    }
}

ProcessRegistry.register("terminalManager", TerminalManager)