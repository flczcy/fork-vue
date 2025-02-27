import {
  EffectScope,
  type Ref,
  WatchErrorCodes,
  type WatchOptions,
  type WatchScheduler,
  computed,
  getCurrentWatcher,
  onWatcherCleanup,
  ref,
  watch,
} from '../src'

const queue: (() => void)[] = []

// a simple scheduler for testing purposes
let isFlushPending = false
const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
const nextTick = (fn?: () => any) =>
  fn ? resolvedPromise.then(fn) : resolvedPromise

const scheduler: WatchScheduler = (job, isFirstRun) => {
  if (isFirstRun) {
    job()
  } else {
    queue.push(job)
    // 异步执行
    flushJobs()
  }
}

const flushJobs = () => {
  if (isFlushPending) return
  isFlushPending = true
  resolvedPromise.then(() => {
    queue.forEach(job => job())
    queue.length = 0
    isFlushPending = false
  })
}

describe('watch', () => {
  test('effect', () => {
    let dummy: any
    const source = ref(0)
    watch(() => {
      dummy = source.value
    })
    expect(dummy).toBe(0)
    source.value++
    expect(dummy).toBe(1)
  })

  test('with callback', () => {
    let dummy: any[] = []
    const source = ref(0)
    watch(source, () => {
      dummy.push(source.value)
    })
    expect(dummy.length).toBe(0)
    source.value++
    source.value++
    expect(dummy.length).toBe(2)
  })

  test('call option with error handling', () => {
    const onError = vi.fn()
    const call: WatchOptions['call'] = function call(fn, type, args) {
      if (Array.isArray(fn)) {
        fn.forEach(f => call(f, type, args))
        return
      }
      try {
        fn.apply(null, args)
      } catch (e) {
        onError(e, type)
      }
    }

    // vue 内部使用 call 绑定了在 watch 各个函数中可能的出错的类型代码
    watch(
      () => {
        throw 'oops in effect'
      },
      null,
      { call },
    )

    const source = ref(0)
    const effect = watch(
      source,
      () => {
        onWatcherCleanup(() => {
          throw 'oops in cleanup'
        })
        throw 'oops in watch'
      },
      { call },
    )

    expect(onError.mock.calls.length).toBe(1)
    expect(onError.mock.calls[0]).toMatchObject([
      'oops in effect',
      WatchErrorCodes.WATCH_CALLBACK,
    ])

    source.value++
    expect(onError.mock.calls.length).toBe(2)
    expect(onError.mock.calls[1]).toMatchObject([
      'oops in watch',
      WatchErrorCodes.WATCH_CALLBACK,
    ])

    effect!.stop()
    // effect.onStop() -> 调用这里的 cleanups 注册的函数即 onWatcherCleanup 中注入的函数
    // 内部使用 call 调用捕获错误 清除函数中抛出的错误
    source.value++
    expect(onError.mock.calls.length).toBe(3)
    expect(onError.mock.calls[2]).toMatchObject([
      'oops in cleanup',
      WatchErrorCodes.WATCH_CLEANUP,
    ])
  })

  test('watch with onWatcherCleanup', async () => {
    let dummy = 0
    let source: Ref<number>
    const scope = new EffectScope()

    scope.run(() => {
      source = ref(0)
      watch(onCleanup => {
        source.value

        // 注册的清理函数第一次/初始化是不会执行的
        // 这里的 onCleanup 就是 fn => onWatcherCleanup(fn) 包装, 内部就是调用 onWatcherCleanup(fn)
        onCleanup(() => (dummy += 2))
        onWatcherCleanup(() => (dummy += 3))
        onWatcherCleanup(() => (dummy += 5))
      })
    })
    expect(dummy).toBe(0)

    // 为何要放在 scope.run 中 设置值?
    // source.value++ // 这里的 source 在上下文中还是 undefined, 需要放在函数中
    // const run = () => {
    //   source.value++
    // }
    // run()

    scope.run(() => {
      source.value++
    })
    expect(dummy).toBe(10)

    scope.run(() => {
      source.value++
    })
    expect(dummy).toBe(20)

    scope.stop() // effect.stop() -> effectOnStop() ->
    // 调用这里的 cleanups 注册的函数即 onWatcherCleanup 中注入的函数
    expect(dummy).toBe(30)
  })

  test('nested calls to baseWatch and onWatcherCleanup', async () => {
    let calls: string[] = []
    let source: Ref<number>
    let copyist: Ref<number>
    const scope = new EffectScope()

    scope.run(() => {
      source = ref(0)
      copyist = ref(0)
      // sync by default
      watch(
        () => {
          // 这里 copyist.value 的设置值触发 effect 即下面的 watch, 但是其更新在异步队列中执行
          const current = (copyist.value = source.value)
          // 这里的 current 在回调函数中, 每一次都是上一次的值
          onWatcherCleanup(() => {
            // 打印上一执行时捕获的 current 闭包, 应是上一次的值
            console.log(`last ${current}`)
            calls.push(`sync ${current}`)
          })
          // 打印本次执行的最新值, 这个值也将成为 onWatcherCleanup后面执行时的打印值
          console.log(`latest ${current}`)
        },
        null,
        {},
      )
      // with scheduler
      watch(
        () => {
          // 这里的回调是在异步中执行的
          const current = copyist.value
          onWatcherCleanup(() => calls.push(`post ${current}`))
        },
        null,
        // effect 每次更新都会执行 scheduler(job, false) -> queueJob(job) 将这里的更新 job 放入队列
        // 然后 flushJobs() 异步执行队列中的 job
        // effect.schedule = () => schedule(job, false)
        { scheduler },
      )
    })

    await nextTick()
    expect(calls).toEqual([])

    scope.run(() => source.value++) // 注意这里的 source.value 此时已经更新为 1 了,
    // 触发 effect, 但是在 cb 执行前 要先执行 () => calls.push(`sync ${current}` 函数, 这里的 current
    // 还是上一次设置的值 0, 当清理函数执行完后, calls = [sync 0], 然后才开始执行 cb 回到函数,
    // 此时 current 被设置为 source.value = 1
    // 但是在 cleanups 清理函数中读取的还是上一次的值, 这里是同通过闭包保存的上一次值的引用
    expect(calls).toEqual(['sync 0'])
    await nextTick()
    expect(calls).toEqual(['sync 0', 'post 0'])
    calls.length = 0

    scope.run(() => source.value++) // 注意这里的 source.value 此时已经更新为 2 了,
    // 当上一次的清理函数执行完后, calls = [sync 1]
    // 此时接着执行这里的 current 赋值, 此时 current = source.value = 2
    // 当下次调用 清理函数时, 执行 () => calls.push(`post ${current}`) 时,
    // current 就是上次执行捕获的闭包的值
    expect(calls).toEqual(['sync 1'])
    await nextTick()
    expect(calls).toEqual(['sync 1', 'post 1'])
    calls.length = 0

    scope.stop() // 最后执行所有的清理函数,其值就是最后一次 watch 回调执行时的值, 此时就是最终的值
    // 执行清理函数,读取的 current 值就是上次 cb 回调函数执行结束后的值 即 current 就是 2
    expect(calls).toEqual(['sync 2', 'post 2'])
  })

  test('once option should be ignored by simple watch', async () => {
    let dummy: any
    const source = ref(0)
    watch(
      () => {
        dummy = source.value
      },
      null,
      { once: true },
    )
    expect(dummy).toBe(0)

    source.value++
    expect(dummy).toBe(1)
  })

  // #12033
  test('recursive sync watcher on computed', () => {
    const r = ref(0)
    // r.value 被 computed 包裹, 这里间接读取 r.value 不会作为 watch effect 的依赖
    const c = computed(() => r.value)

    // effect(() => c.value) -> r.value -> 0
    watch(c, v => {
      // const w = getCurrentWatcher()
      // console.log(w?.deps)
      // v 为 newValue = effect.run()
      if (v > 1) {
        // 注意这里的 r.value 这里没有被 watch effect dep
        console.log(v)
        // NOTE:注意这里是在 cb 回调函数中, 没有 activeSub,
        // 故这里的 r.value 的读取 track 直接无效
        // 但是这里 r.value 的设置 trigger 直接触发其对应的
        // computed.notify() - effect.notify() -> cb() -> r.value-->
        // computed.notify()-> effect.notify() -> cb() -> r.value-->
        // computed.notify()-> effect.notify() -> cb() -> r.value-->
        // ... 无限递归下去, 直到 r.value = 1 时, 不在执行 r.value-- 操作
        r.value--
      }
    })

    expect(r.value).toBe(0)
    expect(c.value).toBe(0)

    r.value = 10 //
    // r.trigger -> computed.notify() -> effect.notify() -> r.value--
    // r.tirgger -> computed.notify() -> effect.notify() -> r.value--
    // r.tirgger -> computed.notify() -> effect.notify() -> r.value--
    // ...
    // until r.value = 1 -> c.value = 1
    expect(r.value).toBe(1)
    expect(c.value).toBe(1)
  })

  // edge case where a nested endBatch() causes an effect to be batched in a
  // nested batch loop with its .next mutated, causing the outer loop to end
  // early
  // batched.next 的修改
  // 这里主要是 endBatch() 函数中的 next 的处理要注意, 里面的 e.trigger() 的递归 trigger
  // dep.trigger ->
  //   startBatch() // ++
  //   batch(sub)
  //   endBatch() { --
  //     // endBatch 中又开始触发 dep.trigger() -> 又开始 startBatch() ... 递归调用
  //     e = batchedSub
  //     batchedSub = undefined
  //     const next = e.next
  //     e.next = undefined // 这里将 e.next 置为 undefined, 避免在下面嵌套的 endBatch() 中 next 被修改
  //     e.flags &= ~EffectFlags.NOTIFIED
  //     startBatch() // ++
  //     batch(sub)
  //     endBatch() // --
  //     e = next
  //   }
  test('nested batch edge case', () => {
    // useClamp from VueUse
    const clamp = (n: number, min: number, max: number) =>
      Math.min(max, Math.max(min, n))
    function useClamp(src: Ref<number>, min: number, max: number) {
      return computed({
        get() {
          console.log('nested batch edge case 4')
          // 这里读取的同时进行值的设定
          const r = src.value
          const v = clamp(r, min, max)
          // 这里读取的值为 1
          // 同时设置的值为 1 - 值相同, 不会触发 trigger
          src.value = v
          return v
        },
        set(val) {
          console.log('nested batch edge case 3')
          // val: 10
          // val: 5
          // 这里值变化了, 触发 watch cb 中, 而在 cb 中执行 clamped.value = 5
          // 又再次进入这里的 set, 此时 计算出的值 为 5 与上次的值一致, 此时不再触发 set
          // 至此, watch 回调结束
          // 接下是 watch computed 的回调, 与第一种一样, 会执行一次
          // effect.isDirty(this) -> refreshComputed -> computed.fn(), fn 就是 computed 的 get函数
          src.value = clamp(val, min, max)
        },
      })
    }

    const src = ref(1)
    // 返回的值为 1 - 5 之间
    const clamped = useClamp(src, 1, 5)
    watch(src, val => {
      console.log('nested batch edge case 1')
      // 这里设置计算属性的值, 进入计算属性 set 中
      // src.value = val -> 这里又触发了 set
      // 由于前后是相同的值, 所以不会触发 trigger ?
      // 这一个案例主要说明 watch() 中又触发 watch() 最终达到 值的稳定
      // 10, 5 -> 值稳定了,
      // src.value = 10, 第一次设置值 10, 触发这里的 watch
      // 接着在 watch 中 执行 clamped.value() 中又设置 src.value = 5 -> 又触发一次 watch
      // 然后执行到这里 clamped.value = 5 最终达到稳定, 否则若是值一直变化, 则会陷入无限循环
      // watch() 中触发 trigger
      clamped.value = val
    })
    // src.value -> watchEffect

    const spy = vi.fn(() => {
      console.log('nested batch edge case 2')
    })
    // 计算属性中的 src.value 不是 watch effect 的 dep
    // 但是设置 src.value 的值会出发 computed.notify -> effect.notify() 最终会出发watch effect 更新
    // 这里的 src.value 对应两个 effect, 一个是 computedEffect, 一个是 watchEffect
    // src.value -> computedEffect
    // 这里读取 clamped.value -> 读取值时, 才开始 track 依赖
    watch(clamped, spy) // -> 读取 value -> 输出 4

    // 进入 ref 的 set 值设置完后,再进行 dep.trigger
    src.value = 2 // trigger effects 这里触发了 两个 effect
    expect(spy).toHaveBeenCalledTimes(1)
    console.log('----------')
    // console.log('nested batch edge case 4')
    // 执行第一个 watchEffect 的输出:
    //   console.log('nested batch edge case 1')
    //   console.log('nested batch edge case 3')
    // 执行第二个 computedEffect 的输出:
    //   注意这里 watch(clamped) 是一个计算属性: 在执行更新的 job 时, 会验证 effect.dirty
    //   其会调用 effect.isDirty(this) 函数, 而这个 effect.isDirty 函数内部对于计算属性
    //   则还会调用 refreshComputed(link.dep.computed) 这个函数 会执行 computed.fn(computed._value)
    //   就是将 computed.fn 就是 创建 computed 传入的 get 函数所以这里还会执行执行 computed 中的 get 函数
    //   console.log('nested batch edge case 4')
    //   console.log('nested batch edge case 2')

    // 这里设置值为 10, 读取时就会触发 set
    // 设置为 10 会在 watch 中有触发 watch
    src.value = 10
    // 这一个案例主要说明 watch() 中又触发 watch() 最终达到 值的稳定
    console.log('done')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  test('should ensure correct execution order in batch processing', () => {
    const dummy: number[] = []
    const n1 = ref(0)
    const n2 = ref(0)
    const sum = computed(() => {
      console.log(0)
      n1.value + n2.value
    })
    // n1.value 追踪 effect
    watch(n1, () => {
      dummy.push(1)
      // 注意 在 watch cb 回调函数中没有对应的 activeSub, 无法进行 track, 但是可以触发 trigger
      // 这里的 set 操作会触发其对应的 sub 更新
      console.log(1)
      // n2.value++
      // 触发 computed.notify -> effect.notify -> endBatch -> effect.trigger ->
      // effect.runIfDirty() -> e.isDirty -> refreshComputed(link.dep.computed)
      // 正是这里的 runIfDirty 的判断, 解决了计算属性多个属性分别设置值时触发 effect.run 多次的问题
      // 若是没有 effect.runIfDirty() 的检测 多个计算属性的更新就会形成多次的 trigger
    })
    // sum.value -> 进入 sum 计算属性
    watch(sum, () => {
      console.log(2)
      dummy.push(2)
    })
    watch(n1, () => {
      console.log(3)
      dummy.push(3)
    })

    // 这里的 n1.value 对应了两种 effect,
    // 第一个是 watchEffect, 第二个是 computedEffect
    // n1.trigger 时, 触发的 effect 要按照顺序 access order 读取顺序进行
    // 首先执行 watchEffect 回调函数 -> 但是在其回调函数中, 又触发了 n2.value++ 导致开始执行
    // n2.value 对应的计算属性的更新, 但是这里还有 n1.value 对应的计算属性需要等待更新呢?
    // 没办法, 因为是同步执行的, 只能先执行 n2.value++ 引起的计算属性的 dep.trigger 了
    // computed.notify -> watchEffect.notify() ->
    // 在执行 watch 对应的 job 前会有  (!effect.dirty && !immediateFirstRun)
    // 对应 effect.dirty 的检测 -> effect.isDirty -> refreshComputed(link.dep.computed)
    // 会对当前的 effect 中每一个 dep 进行脏检查, 特别是计算属性多个属性更新
    // 脏了,就执行一次 job() 也就是这里的 watch(sum, () => {}) 对应的回调函数

    // 现在开始 n1.value++ 引起的更新, 继续执行到 watch 的 (!effect.dirty && !immediateFirstRun)
    // 判断, 此时再次对当前的 effct 进行一次脏检查, 发现不脏了, 这是因为在前一次执行 n2.value++ 所引起的
    // 变化时,执行的 effect 更新, 已经将这里的 n1.value++ 引起的变化考虑进去了, 所以此时再次执行 n1.value++
    // 所引起的变化, 就不触发重新更新了. 这样就避免了一次设置多个属性值所引起的触发多次的更新了
    // 这样在同步模式下(注意这里不考虑异步更新)也可以达到异步模式下的设置多次,只触发一次的更新了, 因为在
    // 触发 trigger 是加入了脏检查

    // 触发 notify
    // n1 对应的subs: [w1, c1, w2]
    // 这里触发 trigger, 此时给各个 sub 设置 flags
    // [w1.notified, c1.notified, w2.notified]
    // 开始从 w1 执行, 但是在 w1 中再次触发 n2.value++, 触发 n2 对应的 subs
    // n2 对应的subs: [c1]
    // n2 n2.dtrigger -> n2.notifiy(), 此时发现 c1 已经有了 notified 标识了,
    // 所以就不再 batch(c1) 了, 此时 batchedSub 没有得到设置
    // 执行 n2 的 endBatch, 但是此时在 batchedSub 已经被设置为 undefined 了,
    // 所以此时的 n2.tirgger 就没有触发更新
    n1.value++

    // expect(dummy).toEqual([1, 2, 3])
  })

  test('脏检查,避免重复更新1', () => {
    const dummy: number[] = []
    const n1 = ref(0)
    const n2 = ref(0)
    const n3 = ref(0)
    watch(() => {
      // 默认开始执行, 没有回调函数
      dummy.push(n1.value + n2.value + n3.value)
    })
    n1.value = 1
    n2.value = 2
    n3.value = 3
    expect(dummy.length).toEqual(4)
  })
  test('脏检查,避免重复更新2', () => {
    const dummy: number[] = []
    const n1 = ref(0)
    const n2 = ref(0)
    const n3 = ref(0)
    const sum = computed(() => n1.value + n2.value + n3.value)
    watch(sum, () => {
      // 默认回调函数执行
      dummy.push(n1.value + n2.value + n3.value)
    })
    n1.value = 1
    n2.value = 2
    n3.value = 3
    expect(dummy.length).toEqual(3)
  })
})
