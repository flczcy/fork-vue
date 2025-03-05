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
      // 执行到 updateComponent 一定说明 n1, n2 是类型相同的 vnode, 否则执行不到这里
      // 因为 类型不同, 会将 n1 置为 null, 从而执行 mountComponent, 而不是这里的 updateComponent
      updateComponent(n1, n2, optimized) {
        const instance = (n2.component = n1.component)!
        const isShouldUpdate = shouldUpdateComponent(n1, n2, optimized) {
          // 比对是否有 children, 是否属性变化
        }
        if (isShouldUpdate) {
          // normal update
          instance.next = n2
          // instance.update is the reactive effect.
          instance.update()
        } else {
          // no update needed. just copy over properties
          n2.el = n1.el
          instance.vnode = n2
        }
      },
      mountComponent(vnode, container, anchor, parent) {
        const instance = createComponentInstance(initialVNode, parentComponent, parentSuspense) {
          const instance = {
            uid: uid++,
            next: null,
            vnode: vnode,
            type, vnode.type,
            subTree: null,
            parent: parent,
            // 注意这里提前创建了 scope, detached 表示不会被 外部的 effect scope 进行收集
            // 比如嵌套的组件, 但是 组件里面的 scope 是不会被外部组件的 scope 进行收集的
            // 所以外部组件调用自己的 instance.scope.stop() 不会影响到子组件,只能对自己组件的 effect 进行管理
            scope: new EffectScope(true /* detached */) {
              this.parent = activeEffectScope
                this._on = 0
            },
            provides: parent ? parent.provides : Object.create(appContext.provides),
          }
          return instance
        }
        vnode.component = instance

        // resolve props and slots for setup context
        setupComponent(instance, false, optimized) => {
          initProps(instance, props, isStateful, isSSR)
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
          const setupResult = setupStatefulComponent(instance, isSSR){
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

                // issues: https://github.com/vuejs/core/issues/2043
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

                onUpdated(() => {
                  // 会在 setup 函数执行完后执行, 这里传入执行时捕获的参数 在setup 执行中 instance 到 传入的
                  // 回调函数中, 即使 setup 执行完后, 重置了 currentInstance, 此时在此处的回调函数执行时
                  // 依然可以访问到 currentInstance
                }, instance = getCurrentInstance())

                onMounted(() => {

                })

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
                // issues: https://github.com/vuejs/core/issues/1801
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

        setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
          // 挂载与更新统一调用这个函数
          // 1. 来自父组件的更新 job 中直接调用 instance.update()
          // 2. 来自自己组件的 dep.trigger -> job(() => componentUpdateFn())
          const componentUpdateFn = () => {
            // 调用 render 函数
            if(!instance.isMounted) {
              // 挂载
              const { el, props } = initialVNode
              const { bm, m, parent, root, type } = instance
              toggleRecurse(instance, false)
              // beforeMount hook 这里是同步执行
              bm && invokeArrayFns(bm)
              toggleRecurse(instance, true)
              // 调用 render 函数创建 vnode (这期间会捕获 currentRenderingInstance) 处理设置到模板中的 ref
              const subTree = renderComponentRoot(instance) => {
                let result;
                let fallthroughAttrs;

                // 设置 render 函数执行时的上下文 主要执行 h() 函数, 创建 vnode, 同时执行依赖搜集
                // render = (proxy, cache, props, state, data, ctx) => h(Foo, { name: bar.name })
                const prev = setCurrentRenderingInstance(instance);
                const { render, props, setupState, renderCache, data, ctx, proxy } = instance;
                const { inheritAttrs, slots, attrs, emit, vnode, type } = instance;
                try {
                  if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
                    // 状态组件
                    const proxyToUse = proxy;
                    const thisProxy = proxyToUse;
                    result = normalizeVNode(
                      // 用户手写的 render() 可以返回 字符串, 数字, 数组, vnode, null, undefined, ...
                      // 故这里需要 normalizeVNode 进行处理
                      render.call(thisProxy, proxy, renderCache, props, setupState, data, ctx) {
                        // 用户手写的渲染函数,或者模板编译后的函数
                        return h(Foo, {name: state.name}, { default: () => h(div, 'foo') }) => {
                          // 调用创建 vnode 的各种函数: createBaseVNode(), ...
                          // 注意这里面的创建 vnode 的函数执行中可以获取 currentRenderingInstance
                        }
                      }
                    );
                  } else {
                    // 函数式组件
                    const render = Component as FunctionalComponent
                    result = normalizeVNode(
                      // 函数式组件里面没有使用 call 注入 this
                      render.length > 1
                        ? render(props, { attrs, slots, emit })
                        : render(props, null as any /* we know it doesn't need it */)
                    );
                  }
                } catch(err) {
                  // 执行出错,清空运行时收集的有编译优化标识的 vnode
                  blockStack.length = 0
                  handleError(err, instance, ErrorCodes.RENDER_FUNCTION)
                  result = createVNode(Comment)
                }

                // attr merging

                setCurrentRenderingInstance(prev);
                return result
              }
              patch(null, subTree, container, anchor, instance /* parentComponent */);
              instance.subTree = subTree
              // 注意这里是 patch() 执行结束后, 才会设置 el 到 subTree.el
              initialVNode.el = subTree.el
              // mounted hook - 这里是异步执行, 同时是在异步执行队列(queue) 执行完后再执行
              m && queuePostFlushCb(m)
              instance.isMounted = true
            } else {
              // 更新
              let { next, bu, u, parent, vnode } = instance
              // updateComponent
              // This is triggered by mutation of component's own state (next: null)
              // OR parent calling processComponent (next: VNode)
              let originNext = next
              // Disallow component effect recursion during pre-lifecycle hooks.
              toggleRecurse(instance, false)
              // 这里在更新属性时, 关闭了 ALLOW_RECURSE, 避免设置属性触发重复的放入队列
              if (next) {
                // from parent calling processComponent
                // 来自父组件更新中,调用 processComponent 执行更新, 此时会创建新的组件 vnode, 即这里的 next
                // 复用之前的 el, 但是 vnode 不可以复用, 因为父组件的更新, 会创建新的 子组件的 vnode
                next.el = vnode.el
                nextVNode = next
                updateComponentPreRender(instance, nextVNode, optimized) {
                  nextVNode.component = instance
                  const prevProps = instance.vnode.props
                  instance.vnode = nextVNode
                  instance.next = null;
                  updateProps(instance, nextVNode.props, prevProps, optimized) {
                    const rawProps = nextVNode.props
                    const rawPrevProps = prevProps
                    const { props, attrs, vnode: { patchFlag } } = instance;
                    const rawCurrentProps = toRaw(props)
                    const [options] = instance.propsOptions
                    let hasAttrsChanged = false
                    setFullProps(instance, rawProps, props, attrs){
                      attrs[y] = rawProps[y]
                      props[x] = rawProps[x]
                      // -> 触发 dep.trigger() 可能触发 watchEffect, 或者 componentEffect
                      // [parentJob]
                      // 1. 触发 watchEffect - queueJob(childWatchJob) 插入到执行队列
                      // 2. 触发 componentEffect - queueJob(childUpdateJob) 插入到执行队列
                      // [parentJob, childWatchJob, childUpdateJob]
                      //  |
                      //  flushingIndex 当前正在执行的 job 为 parentJob
                      // // 因为这里是在 parentJob 中执行的 patch(prevTree, nextTree) -> child.update()
                      parentJob() {
                        // 此时其实还在 parentJob 中执行
                        patch(prevTree, nextTree) {
                          // patch 中会比较前后两个 vnode: prevTree, nextTree 是否需要更新
                          // 同时还要注意此时还是在 parentJob 中执行
                          child.update() { // - 此时正在执行的就是 childUpdateJob
                            updateProps() {
                              props.x = y ->
                              // 注意此时的 toggleRecurse(instance, false) 上面已经执行
                              // 关键是这里的 toggleRecurse(instance, false)
                              // 设置了此时不可以进行 ALLOW_RECURSE,
                              // 避免了在 sub 在运行时, 又触发 set 导致重复添加
                              instance.effect.flags &= ~EffectFlags.ALLOW_RECURSE
                              instance.job.flags! &= ~SchedulerJobFlags.ALLOW_RECURSE
                              // 同时 child.update() 正在执行,那么此时
                              instance.effect.flags |= EffectFlags.RUNNING
                              dep.trigger() {
                                dep.version++
                                dep.notify() {
                                  startBatch() {  batchDepth++ }
                                  for (let link = this.subs; link; link = link.prevSub) {
                                    sub.notify() {
                                      if(sub.flags & EffectFlags.RUNNING) {
                                        // 不允许递归调用则直接返回, 默认为不允许递归
                                        if(!(sub.flags & EffectFlags.ALLOW_RECURSE)) return
                                        // NOTE: 这里是关键:
                                        // childUpdateJob 满足 RUNNING && !ALLOW_RECURSE
                                        // 故这里直接 返回(return), 不会执行 queueJob(childUpdateJob)
                                        // 这里就避免了重复执行这里的 childUpdateJob,
                                        // 因为当前的 childUpdateJob 本身就在执行,
                                        // 没必要再将 childUpdateJob 放入队列执行
                                        // childWatchJob 不满足 RUNNING, 也不满足 !ALLOW_RECURSE
                                        // 故直接执行 queueJob(childWatchJob), 放入队列
                                      }
                                      if(sub.flags & EffectFlags.NOTIFIED) return
                                      // ...
                                      batch(sub) {
                                        sub.flags |= EffectFlags.NOTIFIED
                                        if(isComputed(sub)) {
                                          sub.next = batchedComputed
                                          batchedComputed = sub
                                        } else {
                                          sub.next = batchedSub
                                          batchedSub = sub
                                        }
                                      }
                                    }
                                  }
                                  endBatch() {
                                    batchDepth--
                                    if(batchDepth > 0) return
                                    while(batchedSub) {
                                      e = batchedSub
                                      batchedSub = undefined
                                      while(e) {
                                        next = e.next
                                        e.flags &= ~EffectFlags.NOTIFIED
                                        if (!(e.flags & EffectFlags.ACTIVE)) return
                                        e.trigger(){
                                          const dirty = isDirty(e){}
                                          if (!dirty) return
                                          e.run() {
                                            if (this.flags & EffectFlags.ACTIVE) return
                                            e.flags |= EffectFlags.RUNNING
                                            prepareDeps(this) {
                                              for (let link = sub.deps; link; link = link.nextDep) {
                                                link.version = -1
                                                link.prevActiveLink = link.dep.activeLink
                                                link.dep.activeLink = link
                                              }
                                            }
                                            // NOTE: fn() 执行前,
                                            // 1. NOTIFIED 已经被去掉
                                            // 2. batchedSub 已经被置为 undefined
                                            e.fn() {
                                              dep.track() {
                                                link.version = this.version
                                              }
                                              // 上面的属性设置值, 触发这里 dep.trigger, 由 RUNNING 进行拦截
                                              dep.trigger() {
                                                // RUNNING 正在运行的 sub 中设置值
                                                // !ALLOW_RECURSE 避免触发递归循环 dep.trigger 提前返回
                                                if(sub.flags & Effect.flags.RUNNING) {
                                                  if(!(sub.flags & EffectFlags.ALLOW_RECURSE)) return
                                                }
                                                if(sub.flags & Effect.flags.NOTIFIED) return
                                                // ...
                                              }
                                            }
                                            // 依赖收集结束后, 清除依赖(之前存在的, 这次运行后不存在的, 需要移除)
                                            cleanupDeps(this) {
                                              // 清理 link.version == -1 的 dep, 说明是没有被读取到的 dep
                                              // restore previous active link if any
                                              link.dep.activeLink = link.prevActiveLink
                                              link.prevActiveLink = undefined
                                            }
                                            // 去掉 RUNNING flag
                                            e.flags &= ~EffectFlags.RUNNING
                                          }
                                        }
                                        e.next = next // 继续下一个 sub 的更新
                                      }
                                    }
                                  }
                                }
                              }
                              // 此时队列: [parentJob, childWatchJob.PRE]
                            }
                          }
                        }
                      }
                    }
                  };
                  updateSlots(instance, nextVNode.children, optimized) {

                  }

                  pauseTracking();
                  // props update may have triggered pre-flush watchers.
                  // flush them before the render update.
                  // 前面执行的 updateProps(...) 可能会设置 props.xxx = yyy 导致有 watch(porps.xxx)
                  // 会执行 watcher, 从而将 watch job 放入到队列中, 这里直接在组件更新前执行 watch 的 job
                  // 注意 watch 的 job 都是有 PRE 标识的
                  // 这里保证了 watch() 默认的更新回调函数会在组件的更新前面(包括 beforeUpdate 等)执行
                  flushPreFlushCbs(instance) {
                    // [parentJob, childWatchJob.PRE]
                    // 在之前组件 beforeUpdate hook 前, 先执行队列中的 watcher Job,
                    // 以保证在 render update 前面执行
                    childWatchJob.PRE() // 执行完后,将其从队列中移除
                    // [parentJob]
                    //  |
                    //  flushingIndex
                  }
                  resetTracking()
                }
              } else {
                // from component's own state change
                // 这里是在 else 分支 说明来自父组件的更新优先级高于子组件的更新,
                // 也就是在父组件,子组件都更新时,只进入父组件的更新逻辑中,其会执行子组件的更新
                // 父组件的更新会包含子组件的更新, 所以有限执行父组件的更新,而子组件的更新 job 直接废弃掉.
                // 来自组件内部状态的更新, 复用组件自己的 instance.vnode 即可, 无需再次创建
                // 因为父组件没有更新, 也就是没有创建新的 subTree, 故当前组件的 vnode 就是之前父组件创建的 vnode
                // NOTE: 子组件的 vnode 都是通过父组件创建的
                next = vnode
              }
              // 注意以上的 watch 更新会在 这里的 beforeUpdate hook 前面执行
              // beforeUpdate hook 这里是同步执行
              bu && invokeArrayFns(bu)
              // [parentJob]
              //  |
              //  flushingIndex
              toggleRecurse(instance, true)
              const nextTree = renderComponentRoot(instance)
              const prevTree = instance.subTree
              patch(prevTree, nextTree, container, anchor, instance /* parentComponent */)
              instance.subTree = nextTree
              next.el = nextTree.el
              // updated hook 异步执行
              u && queuePostFlushCb(u)
            }
          }

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

          // instance.update 就是 effect.run 函数, 每次执行
          // instance.update() -> effect.run() -> 会设置 instance.update.RUNNING 标识,
          // 后面在 instance.update() 触发属性更新时, 就会触发 dep.trigger() -> 通过这里的
          // RUNNING 与 !ALLOW_RECURSE 来防止重复加入到 queue 中触发执行重复的更新函数
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
