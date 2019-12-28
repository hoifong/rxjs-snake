const Rx = rxjs;
const $ = rxjs.operators;

const stage = document.getElementById('game');
const scoreEl = document.getElementById('score');
const context = stage.getContext('2d');

/**
 * consts
 */
const FPS = 60;             //  每秒刷新多少次
const LOW_SPEED = 100;      //  低速
const HIGH_SPEED = 300;     //  高速
const BODY_WIDTH = 10;      //  身体宽度
const HALF_BODY_WIDTH = BODY_WIDTH/2;   //  身体宽度的一半
const FOOD_RADIUS = 10;      //  食物半径
const PER_FOOD_INCRE = 20;   //  每个食物提供的增长值
const INIT_LEN = 100;       //  蛇的初始长度
const DIRECTIONS = {        //  方向键码
    up: 38,
    down: 40,
    left: 37,
    right: 39
};

const initState = {
    direction: DIRECTIONS.left,
    position: [stage.width/2, stage.height/2],
    body: [
        {
            direction: DIRECTIONS.right,
            len: INIT_LEN
        }
    ],
    food: createFood()
}

/**
 * source
 */
const keyDown$ = Rx.fromEvent(document, 'keydown').pipe($.distinctUntilChanged());
const keyUp$ = Rx.fromEvent(document, 'keyup');
const ticker$ = Rx.interval(1000/FPS, Rx.animationFrameScheduler).pipe(
    $.map(() => ({
        time: Date.now(),
        delay: 0
    })),
    $.scan((prev, cur) => ({
        time: cur.time,
        delay: (cur.time - prev.time)/1000
    }))
);

/**
 * speed
 */
const speed$ = keyDown$.pipe(
    $.filter(e => e.keyCode === 32),
    $.map(() => HIGH_SPEED),
    $.merge(
        keyUp$.pipe(
            $.map(() => LOW_SPEED)
        )
    )
)

/**
 * direction
 */
const directions = [DIRECTIONS.left, DIRECTIONS.up, DIRECTIONS.right, DIRECTIONS.down];
const direction$ = keyDown$.pipe(
    $.map(e => e.keyCode),
    $.filter(code => directions.indexOf(code) !== -1),
    $.scan((prev, cur) => {
        if (prev === cur || Math.abs(cur - prev) === 2) return prev;
        return cur;
    }),
    $.startWith(directions[0]),
    $.distinctUntilChanged(),       //  此时发出的方向只会与之前的方向不同
);

// log test
// direction$.subscribe(console.log);

/**
 * snake
 */
const snake$ = ticker$.pipe(
    $.withLatestFrom(speed$, direction$),
    $.scan((state, [ticker, speed, direction]) => {
        const move = ticker.delay*speed;
        let body = state.body;
        let position = state.position;
        let food = state.food;

        if (detectFood(state)) {
            const nail = body[body.length - 1];
            body = [...body.slice(0, -1), { len: nail.len + PER_FOOD_INCRE, direction: nail.direction }];
            food = createFood();
        }

        /**
         * 处理头部位置
         */
        switch (direction) {
            case DIRECTIONS.up:
                position = [position[0], position[1]-move];
                break;
            case DIRECTIONS.down:
                position = [position[0], position[1]+move];
                break;
            case DIRECTIONS.left:
                position = [position[0] - move, position[1]];
                break;
            case DIRECTIONS.right:
                position = [position[0] + move, position[1]];
                break;
            default: break;
        }
        // console.log('deal head:', position);
 
        /**
         * 处理身体移动问题
         */
        if (direction === state.direction) {
            //  与之前方向相同
            body = [{direction: body[0].direction, len: body[0].len + move}, ...body.slice(1)];
        } else {
            const newHead = {
                direction: direction,
                len: move + BODY_WIDTH
            };
            switch (direction) {
                case DIRECTIONS.up:
                    newHead.direction = DIRECTIONS.down;
                    break;
                case DIRECTIONS.down:
                    newHead.direction = DIRECTIONS.up;
                    break;
                case DIRECTIONS.left:
                    newHead.direction = DIRECTIONS.right;
                    break;
                case DIRECTIONS.right:
                    newHead.direction = DIRECTIONS.left;
                    break;
                default: break;
            }

            const oldHead = {
                direction: body[0].direction,
                len: body[0].len - BODY_WIDTH
            };
 
            body = [newHead, oldHead, ...body.slice(1)];
        }

        // console.log('deal body', body);

        /**
         * 处理尾部
         */
        let restMove = move;
        while(1) {
            const nail = body[body.length - 1];
            if (nail.len > restMove) {
                body = [ ...body.slice(0, -1), {
                    direction: nail.direction,
                    len: nail.len - restMove
                }];
                break;
            } else if (nail.len === restMove) {
                body = body.slice(0, -1);
                break;
            }
            restMove -= nail.len;
            body = body.slice(0, -1);
        }

        // console.log('deal nail', body);

        return {
            direction,
            body,
            position,
            food
        }

    }, initState),
    $.takeWhile(state => {  //  游戏结束条件
        //  碰到边界
        if (detectEdge(state) && detectSelf(state)) {
            return true;
        }
        return false;
    })
);

//  食物碰撞检测
function detectFood({position, food}) {
    if (
        Math.sqrt(Math.pow(position[0] - food[0], 2) + Math.pow(position[1] - food[1], 2)) <= FOOD_RADIUS
    ) {
        return true;
    }
    return false;
}

//  随机创造一个食物
function createFood() {
    return [ Math.random()*stage.width, Math.random()*stage.height ];
}

//  边界碰撞检测
function detectEdge(state) {
    const { position, direction } = state;
    switch(direction) {
        case DIRECTIONS.up:
            if (position[1] <= HALF_BODY_WIDTH) return false;
            break;
        case DIRECTIONS.down:
            if (position[1] >= stage.height - HALF_BODY_WIDTH) return false;
            break;
        case DIRECTIONS.left:
            if (position[0] <= HALF_BODY_WIDTH) return false;
            break;
        case DIRECTIONS.right:
            if (position[0] >= stage.width - HALF_BODY_WIDTH) return false;
            break;
        default:;
    }

    return true;
}

//  自身碰撞检测
function detectSelf(state) {
    const direction = state.direction;
    const headx = state.position[0], heady = state.position[1];
    let edgeStart = state.position;     //身体每节的起点

    return !state.body.some((edge, idx) => {
        const len = idx === 0 ? edge.len - BODY_WIDTH : edge.len;
        let nextEdgeStart;  //下一节的起点
        switch (edge.direction) {
            case DIRECTIONS.up:
                nextEdgeStart = [edgeStart[0], edgeStart[1] - len]
                break;
            case DIRECTIONS.down:
                nextEdgeStart = [edgeStart[0], edgeStart[1] + len];
                break;
            case DIRECTIONS.left:
                nextEdgeStart = [edgeStart[0] - len, edgeStart[1]];
                break;
            case DIRECTIONS.right:
                nextEdgeStart = [edgeStart[0] + len, edgeStart[1]];
                break;
        }
        if (idx > 1 && edge.direction !== direction && Math.abs(edge.direction - direction) !== 2) {
            //  身体的前两节不可能相撞
            //  只考虑与当前方向非平行的情况
            let left, right, top, bottom;
            switch (edge.direction) {
                case DIRECTIONS.up:
                    left = edgeStart[0] - HALF_BODY_WIDTH;
                    right = edgeStart[0] + HALF_BODY_WIDTH;
                    bottom = edgeStart[1] + HALF_BODY_WIDTH;
                    top = bottom - edge.len - BODY_WIDTH;
                    break;
                case DIRECTIONS.down:
                    left = edgeStart[0] - HALF_BODY_WIDTH;
                    right = edgeStart[0] + HALF_BODY_WIDTH;
                    top = edgeStart[1] - HALF_BODY_WIDTH;
                    bottom = top + edge.len + BODY_WIDTH;
                    break;
                case DIRECTIONS.left:
                    top = edgeStart[1] - HALF_BODY_WIDTH;
                    bottom = edgeStart[1] + HALF_BODY_WIDTH;
                    right = edgeStart[0] + HALF_BODY_WIDTH;
                    left = right - edge.len - BODY_WIDTH;
                    break;
                case DIRECTIONS.right:
                    top = edgeStart[1] - HALF_BODY_WIDTH;
                    bottom = edgeStart[1] + HALF_BODY_WIDTH;
                    left = edgeStart[0] - HALF_BODY_WIDTH;
                    right = left + edge.len + BODY_WIDTH;
                    break;
                default:;
            }

            if (
                headx >= left - HALF_BODY_WIDTH && headx <= right + HALF_BODY_WIDTH &&
                heady >= top - HALF_BODY_WIDTH && heady <= bottom + HALF_BODY_WIDTH
            ) {
                return true;
            }
        }

        edgeStart = nextEdgeStart;

        return false;
    })
}

function drawSnake(state) {
    const { body, position, food } = state;
    

    context.clearRect(0, 0, stage.width, stage.height);
    context.fillStyle='#222222';
    context.beginPath();

    //  画蛇的身体
    let totalLen = 0;
    let start = position;
    body.forEach((item, idx) => {
        const len = idx === 0 ? item.len : (item.len + BODY_WIDTH);
        let left, top, width, height;
        totalLen += item.len;
        switch(item.direction) {
            case DIRECTIONS.up:
                left = start[0] - HALF_BODY_WIDTH;
                top = start[1] + HALF_BODY_WIDTH - len;
                width = BODY_WIDTH;
                height = len;
                start = [start[0], top + HALF_BODY_WIDTH];
                break;
            case DIRECTIONS.down:
                left = start[0] - HALF_BODY_WIDTH;
                top = start[1] - HALF_BODY_WIDTH;
                width = BODY_WIDTH;
                height = len;
                start = [start[0], top + len - HALF_BODY_WIDTH];
                break;
            case DIRECTIONS.left:
                left = start[0] + HALF_BODY_WIDTH - len;
                top = start[1] - HALF_BODY_WIDTH;
                width = len;
                height = BODY_WIDTH;
                start = [left + HALF_BODY_WIDTH, start[1]];
                break;
            case DIRECTIONS.right:
                left = start[0] - HALF_BODY_WIDTH;
                top = start[1] - HALF_BODY_WIDTH;
                width = len;
                height = BODY_WIDTH;
                start = [left + len - HALF_BODY_WIDTH, start[1]];
                break;
            default:;
        } 

        context.fillRect(left, top, width, height);
    });

    scoreEl.innerText= Math.ceil(totalLen - INIT_LEN);

    //  画蛇头
    context.closePath();
    context.fillStyle='red';
    context.beginPath();
    context.arc(position[0], position[1], FOOD_RADIUS, 0, Math.PI * 2, true);
    context.closePath();
    context.fill();
    
    //  画食物
    context.fillStyle='green';
    context.beginPath();
    context.arc(food[0], food[1], FOOD_RADIUS, 0, Math.PI * 2, true);
    context.closePath();
    context.fill();

}

const game$ = keyDown$
    .pipe(
        $.filter(e => e.keyCode === 13),
        $.switchMap(() => snake$)
    )


game$.subscribe(drawSnake);