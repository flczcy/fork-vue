```js
app = createApp(App, props)

app.mount(container) {
  // 这是 root vnode, 但是这里没有传入 children, 也即传入的组件 App 中, 在作为根组件时,
  // 传入不了 slots,
  const vnode = createVNode(rootComponent, rootProps) {
    const vnode = {}
    normalizeChildren(vnode, children){
      let type = 0
      const { shapeFlag } = vnode
      // 创建的 root vnode, 没有传入 children
      if (children == null) {
        children = null
      }
      vnode.children = children
      vnode.shapeFlag |= type
    }
    // 由于 root vnode 创建时, 没有传入 children 所以 root vnode 不涉及到 slots 的处理
    return vnode.children
  }
  // 以上的 vnode 是在 root component 创建前创建的 所以在创建 root vnode 时,
  // currentRenderingInstance 没有被设置
  // 渲染 root vnode
  render(vnode, container) {
    patch(container._vnode || null, vnode, container) {
      mountComponent(vnode, container, anchor, parentComponent) {
        const instance = createComponentInstance(initialVNode, parentComponent, parentSuspense) {
          const instance = {
            subTree: null,
            // 注意这里提前创建了 scope, detached 表示不会被 外部的 effect scope 进行收集
            // 比如嵌套的组件, 但是 组件里面的 scope 是不会被外部组件的 scope 进行收集的
            // 所以外部组件调用自己的 instance.scope.stop() 不会影响到子组件,只能对自己组件的 effect 进行管理
            scope: new EffectScope(true /* detached */) {
              this.parent = activeEffectScope
                this._on = 0
            }
          }
          return instance
        }
        vnode.component = instance
        setupComponent(instance, false, optimized){
          initProps(instance, props, isStateful, isSSR) {}
          initSlots(instance, children, optimized) {
            const slots = createInternalObject()
            instance.slots = slots
            // 这里的 children 为 null, 直接返回不进行处理, instance.slots = {}
            // HINT: 这里的 ShapeFlags.SLOTS_CHILDREN 保证了 children 不会是 null
            if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
              // 手写 render 函数传入的 slots
              normalizeObjectSlots(children, slots, instance)(){
                // 这里的 _ctx 在创建 vnode 时设置于 normalizeChildren 函数中
                const ctx = children._ctx
              }
            } else if (children) {
              // ...
            }
          }
          // 注意第一个根组件执行到此处时,还没有设置 currentInstance, currentRenderingInstance
          const setupResult = setupStatefulComponent(instance, isSSR) {
            const Component = instance.type as ComponentOptions
            // 0. create render proxy property access cache
            instance.accessCache = Object.create(null)
            // 1. create public instance / render proxy
            instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers)
            // 2. call setup()
            const { setup } = Component
            if (setup) {
              pauseTracking()
              const setupContext = createSetupContext(instance) {
                return {
                  expose,
                  emit: instance.emit,
                  attrs: instance.attrs,
                  slots: instance.slots,
                }
              }
              instance.setupContext = setupContext
              // 设置 currentInstance, 但是此时的 currentRenderingInstance 还未设置
              const reset = setCurrentInstance(instance)
              // 执行 setup 函数
              const setupResult = setup(instance.props, setupContext) {
                // 用户组件 setup 函数可能写入的代码:

                const ctx = inject('CONTEXT')
                // not working (works when wrapped inside onBeforeMount)
                ctx.msg.value = 'updated' => {
                  // 设置值, 触发父组件更新, 但是此时这是在子组件的 setup 函数中执行, 本身就是在父组件的
                  // 执行上下文中, 即父组件的
                  // update() {
                  //   subTree = parent.render()
                  //   patch(null, subTree) -> 父组件执行 patch() 中就会执行到这里
                  // }
                  // NOTE: 这里是 setup 函数中, 属于父级 job 执行的上下文
                  // 只有 根组件的 setup 函数执行时, 没有父级 job 的,
                  // 其他的组件的 setup 执行时(也即创建新的组件)时, 都是有父级的 job 上下文的
                  // 除了整个组件的初始化除外, 只要是通过 dep.trigger 更新的,
                  // 子组件的 setup函数/更新函数 上下文都是属于父组件的 job 函数的执行, 并且都是在异步队列中执行
                  dep.trigger() {
                    parentEffect.scheduler() {
                      // [parentJob]
                      // 插队执行, 当前正在执行的队列 [parentJob, childJob]
                      //                           | flushingIndex
                      queueJob(job) {
                        // [parentJob, parentJob, childJob]
                        //  | flushingIndex
                        // 当前的 parentJob 执行完后, 继续执行下一个 job, 又是 parentJob 自己
                        // 因为这里 parentJob.ALLOW_RECURSE, 所以可以重复插入自己到队列中
                        // 这样就又开始递归执行自己, 再次执行到 ctx.msg.value = 'updated', 此时的赋值操作
                        // 前后值相同, 则不会触发 dep.trigger -> queueuJob 就不会继续插队执行了,
                        // 而是执行队列下一个 job
                      }
                    }
                  }
                }

                // onBeforeMount(() => {
                //   ctx.msg.value = 'updated'
                // })

                // 在 setup 函数执行的 watch 函数, 只是进行了一次依赖收集, 并没有触发 queueJob(job),
                // 因为没有触发 dep.trigger, 若是在 watch 函数执行完后, 直接下 setup 函数中,
                // 触发 dep.trigger, 那么会执行 queueJob(job) 放入到队列, 此时并不会立即这里的 job,
                // 也就不会阻塞 setup 函数的执行, 这里触发的 job, 会放入异步队列中执行
                // props.id -> dep.subs: [parentUpdateEffect, childWatchEffect, childUpdateEffect]
                // props.id++ -> dep.trigger() -> 一个同步的 for 循环 同步执行 三个 queueJob()

                // 不断的插入执行, 其实每调用一次 queueJob(job) 就会进行一次插入到队列中, 若是队列还没有执行
                // 同时开启队列的异步执行
                // parentUpdateEffect.scheduler() -> queueJob(parentUpdateJob)
                // childWatchEffect.scheduler() -> queueJob(childWatchJob)
                // childUpdateEffect.scheduler() -> queueJob(childUpdateJob)

                // [parentUpdateJob, childWatchJob, childUpdateJob]
                //                   | flushingIndex
                watch(() => props.id, () => {
                  // watch 回调函数中触发 dep.trigger() -> queueJob()
                  // 当执行 childWatchJob 时, 这里又触发了 dep.trigger(), 那么此时将 job 插入到 queue 中
                  // [parentUpdateJob, childWatchJob, parentUpdateJob, childUpdateJob]
                  //                   | flushingIndex
                  parent.loading = true => {
                    dep.trigger() {
                      // [parentUpdateJob, childWatchJob, childUpdateJob]
                      // 插队执行
                      queueJob(parentUpdateJob) {
                        // 这里再次插入 parentUpdateJob 的前提是 parentUpdateJob 无 QUEUEED 标识
                        // 但是 parentUpdateJob 之前已经被插入到队列了, 此时已经打上了 QUEUEED 标识
                        // 所以这里也就是不能继续插入重复的有 QUEUEED 标识 到队列了, 那怎么插入重复的 job 到
                        // 队列呢? 这里是将允许重复插入的 job 设置 ALLOW_RECURSE 标识
                        // 若是有 ALLOW_RECURSE 标识, 标识, 就去掉 QUEUEED 标识,
                        // 这样就可以重复插入相同的 job 到队列了.
                        // 这也是为什么 vue 会设置 toggleRecurse(instance, true) 的原因
                        // 就是组件的更新 instance.job 是允许 ALLOW_RECURSE, 因为可能子组件触发父组件的更新
                        // 就需要再次将父组件的 job 插入到 队列中, 执行父组件的 job, 从而更新父组件的视图

                        //                   | flushingIndex
                        // [parentUpdateJob, childWatchJob, parentUpdateJob, childUpdateJob]
                        // 当前 childWatchJob 执行完后, 再次执行 parentUpdateJob 来更新渲染在
                        // childWatchJob 中设置的值到更新到父组件中
                      }
                    }
                  }
                })(source, cb){
                  job.flags! |= SchedulerJobFlags.ALLOW_RECURSE
                  job.flags! |= SchedulerJobFlags.PRE
                  job.id = instance.uid
                  effect.scheduler = (job, isFirstRun) => {
                    if (isFirstRun) {
                      // 若是立即执行, 就会同步执行 job(), 阻塞 setup 函数执行,
                      // 而不是 queueJob(job) 到异步队列中执行
                      job()
                    } else {
                      // NOTE:
                      // 这里的 queueJob 并不是在 setup 中执行 watch 时就执行这里的 quueJob(job)
                      // 即使组件都 mounted, 也不会执行这里的 watch 的回调函数, 唯一被执行时, 就是依赖的
                      // 值变化了, 触发了 dep.trigger() 才会执行这里的 queueJob()
                      // 这里与下面 setupRenderEffect() 中设置的 组件更新函数一样, 不会组件挂载完后就执行
                      // queueJob, 也是需要组件的依赖 更新后, 才会执行组件中的 queueJob() 函数
                      // 比如 dep 已被 watchEffect 依赖, 又被 componentEffect 依赖, 那么这里就看 dep 先
                      // 哪个 effect 进行读取收集了, 比如在组件的 setup 执行中 watch 肯定先被 watchEffect
                      // 收集, 然后才是在 setupRenderEffect() 执行 update() 函数后被 componentEffect 收集
                      // dep.subs:[watchEffect, componentEffect]
                      // queueJob(job): [PRE]
                      // queueJob(job): [PRE, Job]
                      // -> 这里插入相等 id 的 job 到队列, 但是队列中已经存在相同的 id, 同时又 PRE 标识,
                      // 所以这里插入到相同 id 的 PRE 后面
                      // dep.trigger() -> 先执行 watchEffect.run, 后面在执行 componentEffect.run
                      queueJob(job)
                    }
                  }
                }
                return {}
              }
              // setup 函数执行完后恢复上下文
              resetTracking()
              reset() // 重置 currentInstance
              // 设置 instance.render or instance.setupState
              handleSetupResult(instance, setupResult, isSSR) {
                // setup 函数执行后, 返回一个函数
                if (isFunction(setupResult)) {
                  instance.render = setupResult
                } else if (isObject(setupResult)) {
                  instance.setupState = proxyRefs(setupResult)
                } else if (__DEV__ && setupResult !== undefined) {
                  warn(
                    `setup() should return an object. Received: ${
                      setupResult === null ? 'null' : typeof setupResult
                    }`,
                  )
                }
                finishComponentSetup(instance, isSSR){
                  const Component = instance.type as ComponentOptions
                  if (!instance.render) {
                    instance.render = (Component.render || NOOP) as InternalRenderFunction
                  }
                  // warn missing template/render
                  // the runtime compilation of template in SSR is done by server-render
                  if (__DEV__ && !Component.render && instance.render === NOOP && !isSSR) {
                      warn(`Component is missing template or render function: `, Component)
                  }
                }
              }
            }
          }
        }
        setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) {
          const componentUpdateFn = () => {}

          // create reactive effect for rendering
          instance.scope.on(){
            // this._on 初始值为 0
            this._on++
            if (this._on === 1) {
              // 这里调用 on 表示开启 instance.scope 进行收集,
              // 因为这里面设置的 activeEffectScope 到 instance.scope, 只要设置了 activeEffectScope,
              // 就可以进行 effect 的收集
              this.prevScope = activeEffectScope
              activeEffectScope = this
            }
          }
          // instance.scope.on() 设置 activeEffectScope = instance.scope
          const effect = (instance.effect = new ReactiveEffect(componentUpdateFn)) {
            // 这里通过 instance.scope.on() 设置了 activeEffectScope, 所以这里可以收集这个组件的 effect
            // 到 instance.scope.effects 中
            if (activeEffectScope && activeEffectScope.active) {
              activeEffectScope.effects.push(this)
            }
            // 后面只要调用 instance.scope.stop(), pause(), resume() 的方法就可以对当前组件的 effect
            // 响应式进行停止,暂停等管理
          }
          // instance.scope.off() 重置 activeEffectScope, 关闭当前组件 effect 的收集
          instance.scope.off() {
            this._on--
            if (this._on > 0 && this._on === 0) {
              activeEffectScope = this.prevScope
              this.prevScope = undefined
            }
          }

          const update = (instance.update = effect.run.bind(effect))

          const job = (instance.job = effect.runIfDirty.bind(effect)) {
            // 每一次 job 执行时, 都会对当前的 effect 进行脏检查
            if(isDirty(effect)){
              for (let link = effect.deps; link; link = link.nextDep) {
                if (link.version !== link.dep.version) return true
                if (link.dep.computed) {
                  // 调用 refreshComputed() 对计算属性进行求值, 更新计算属性的 dep.version
                  refreshComputed(link.dep.computed)
                  // 更新 计算属性的 dep.version 后
                  if (link.version !== link.dep.version) return true
                }
              }
              return false
            } {
              effect.run() {
                componentUpdateFn()
              }
            }
          }
          // instance.effect
          // instance.update,
          // instance.job,
          job.i = instance
          job.id = instance.uid
          effect.scheduler = () => queueJob(job)

          // allowRecurse
          // #1801, #2043 component render effects should allow recursive updates
          toggleRecurse({ effect, job }, allowed)(instance, true){
            if (allowed) {
              effect.flags |= EffectFlags.ALLOW_RECURSE
              job.flags! |= SchedulerJobFlags.ALLOW_RECURSE
            } else {
              effect.flags &= ~EffectFlags.ALLOW_RECURSE
              job.flags! &= ~SchedulerJobFlags.ALLOW_RECURSE
            }
          }
          // effect.run() 这里直接调用 run, 而不是 job, 无需脏检查
          // 后面更新时, 每次都是执行 job, 里面在执行 run 之前, 会进行脏检查
          update()
        }
      }
    }
  }
}
```
