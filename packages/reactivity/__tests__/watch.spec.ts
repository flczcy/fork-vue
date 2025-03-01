import {
  EffectScope,
  type Ref,
  WatchErrorCodes,
  type WatchOptions,
  type WatchScheduler,
  computed,
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
  test('nested batch edge case', () => {
    // useClamp from VueUse
    const clamp = (n: number, min: number, max: number) =>
      Math.min(max, Math.max(min, n))
    function useClamp(src: Ref<number>, min: number, max: number) {
      return computed({
        get() {
          console.log('nested batch edge case 4')
          const r = src.value
          const v = clamp(r, min, max)
          src.value = v
          return v
        },
        set(val) {
          console.log('nested batch edge case 3')
          src.value = clamp(val, min, max)
        },
      })
    }

    const src = ref(1)
    // 返回的值为 1 - 5 之间
    const clamped = useClamp(src, 1, 5)
    watch(src, val => {
      console.log('nested batch edge case 1')
      clamped.value = val
    })
    const spy = vi.fn(() => {
      console.log('nested batch edge case 2')
    })
    watch(clamped, spy)

    src.value = 2
    expect(spy).toHaveBeenCalledTimes(1)
    console.log('----------')
    src.value = 10
    // 这一个案例主要说明 watch() 中又触发 watch() 最终达到 值的稳定
    console.log('done')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  test('should ensure correct execution order in batch processing', () => {
    const dummy: number[] = []
    const n1 = ref(0)
    const n2 = ref(0)
    const sum = computed(
      /* c1 */ () => {
        console.log(0)
        return n1.value + n2.value
      },
    )
    watch(/* w1 */ n1, () => {
      dummy.push(1)
      console.log(1)
      n2.value++ // NOTIFIED
      n2.value++ // NOTIFIED
      n2.value++ // NOTIFIED
    })
    watch(/* w2 */ sum, () => {
      console.log(2)
      dummy.push(2)
    })
    watch(/* w3 */ n1, () => {
      console.log(3)
      dummy.push(3)
    })
    n1.value++
    expect(dummy).toEqual([1, 2, 3])
  })

  test('sub - 脏检查1', () => {
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
  test('sub - 脏检查2', () => {
    const dummy: number[] = []
    const n1 = ref(0)
    const n2 = ref(0)
    const n3 = ref(0)
    const clamp = (n: number, min: number, max: number) =>
      Math.min(max, Math.max(min, n))
    const sum = computed(() => {
      const res = n1.value + n2.value + n3.value
      const ret = clamp(res, 5, 10)
      console.log('computed:', res, ret)
      return ret
    })
    // sum.value -> 5
    watch(sum, val => {
      console.log(val)
      dummy.push(val)
    })
    n1.value = 1 // 5 - 无效
    n2.value = 2 // 5 - 无效 脏检查值不变
    n3.value = 3 // 6 - 有效
    expect(dummy.length).toEqual(1)
  })
})
