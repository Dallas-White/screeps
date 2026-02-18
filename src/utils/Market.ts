export function getAskPrice(resource: ResourceConstant): number {
    let orders = Game.market.getAllOrders({ resourceType: resource, type: ORDER_SELL})
    let min = 999999999999
    for (let order of orders) {
        if(order.price < min) min = order.price
    }
    return min
}

export function getBidPrice(resource: ResourceConstant): number {
    let orders = Game.market.getAllOrders({ resourceType: resource, type: ORDER_BUY})
    let max = 0
    for (let order of orders) {
        if(order.price > max) max = order.price
    }
    return max
}

export function calculateOrderFee(price: number, amount: number) {
    return price * amount * 0.05
}

export function sellImmediately(terminal: StructureTerminal, resource: ResourceConstant, amount: number | undefined) {
    if(!amount) amount = terminal.store[resource]
    let orders = Game.market.getAllOrders({ resourceType: resource, type: ORDER_BUY})
    let max = undefined
    for (let order of orders) {
        if((!max || order.price> max?.price) && Game.market.calcTransactionCost(amount , order.roomName!, terminal.room.name) <= terminal.store[RESOURCE_ENERGY]) max = order
    }
    if(!max) return
    if(max.amount < amount) amount = max.amount
    Game.market.deal(max?.id,amount,terminal.room.name)
}
