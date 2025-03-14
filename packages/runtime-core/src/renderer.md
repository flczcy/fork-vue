```js
export let currentApp: App<unknown> | null = null
app = createApp(App, rootProps) {
  const renderer = function createRenderer(rendererOptions){
    const patch = (n1, n2, container, parent) {
    }
    const render = (vnode, container) => {
      patch(n1, n2, container, anchor, parent)
    }
    return {
      render,
      createApp: function createAppAPI(render, hydrate){
        let uid = 0
        return function createApp(rootComponent, rootProps = null) {...}
      }
    }
  }
  return renderer.createApp(App, rootProps) {
    const rootComponent = App
    const context = function createAppContext(){
      return {
        app: null, // app = context.app = {}
        config: {
          isNativeTag: NO,
          performance: false,
          globalProperties: {},
          optionMergeStrategies: {},
          errorHandler: undefined,
          warnHandler: undefined,
          compilerOptions: {},
        },
        mixins: [],
        components: {},
        directives: {},
        provides: Object.create(null),
        optionsCache: new WeakMap(),
        propsCache: new WeakMap(),
        emitsCache: new WeakMap(),
      }
    }
    const installedPlugins = new WeakSet()
    let isMounted = false
    // context.app 在这里赋值为一个新对象
    const app = context.app = {
      _uid: uid++,
      _props: rootProps,
      _component: rootComponent,
      _context: context,
      _instance: null,
      version: __VERSION__,
      get config() { return context.config },
      use(plugin: Plugin, ...options: any[]) {
        if (installedPlugins.has(plugin)) {
          __DEV__ && warn(`Plugin has already been applied to target app.`)
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin)
          plugin.install(app, ...options)
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin)
          plugin(app, ...options)
        } else if (__DEV__) {
          warn(
            `A plugin must either be a function or an object with an "install" ` +
              `function.`,
          )
        }
        return app
      },
      // context.provides
      provide(key, value) {
        context.provides[key] = value
        return app
      },
      // context.components
      component(name: string, component?: Component) {
        if (!component) {
          return context.components[name]
        }
        if (__DEV__ && context.components[name]) {
          warn(`Component "${name}" has already been registered in target app.`)
        }
        context.components[name] = component
        return app
      },
      // context.directives
      directive(name: string, directive?: Directive) {
        if (!directive) {
          return context.directives[name] as any
        }
        if (__DEV__ && context.directives[name]) {
          warn(`Directive "${name}" has already been registered in target app.`)
        }
        context.directives[name] = directive
        return app
      },
      // 只有调用过 runWithContext(fn) 才有给 currentApp 设置值,
      // 执行完 fn() 后, 将 currentApp 重置
      // Used to identify the current app when using `inject()` within
      runWithContext(fn) {
        const lastApp = currentApp
        currentApp = app
        try {
          // 保证 fn() 的执行上下文中有 currentApp
          return fn()
        } finally {
          currentApp = lastApp
        }
      },
      // render(rootVNode, rootProps)
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          // app.mount(rootContainer)
        } else if (__DEV__) {
          warn(
            `App has already been mounted.\n` +
              `If you want to remount the same app, move your app creation logic ` +
              `into a factory function and create fresh app instances for each ` +
              `mount - e.g. \`const createMyApp = () => createApp(App)\``,
          )
        }
      }
    }
  }
}

app.mount(container, isHydrate) {
  // 这是 root vnode, 但是这里没有传入 children,
  // 也即传入的组件 App 中, 在作为根组件时, 传入不了 slots,
  // 所有的 vnode 都是组件 subTrre 的一部分
  // 所有的 vnode 都是在 patch 中进行的, 最终转换为组件或者元素的
  // createVNode(type, props, children)
  //   -> patch(vnode) -> createComponent(vnode) -> createElement(vnode)
  // createVNode(type, props, children)
  //   -> patch(vnode) -> createElement(vnode)
  const vnode = createVNode(rootComponent, rootProps) {
    const type = rootComponent
    const vnode = {
      type: type,
      props: rootProps,
      children: null,
      patchFlag = 0,
      shapeFlag: type === Fragment ? 0 : ShapeFlags.ELEMENT,
      el: null, // patch() 时创建元素后赋值
      component: null, // patch 时创建组件后赋值
      ctx: currentRenderingInstance, // patch 时创建组件后赋值(这里为创建的 App 组件实例)
      appContext: null, // application root node only 只有 root vnode 才有这个 appContext
    }
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
    // 因为 root vnode 没有 parent vnode, 所以无法传入 slots, 因为 slots 只能是父组件传入给子组件
    // 而 root vnode 压根就没有 parent vnode
    return vnode
  };

  // createComponentInstance() 设置
  // store app context on the root VNode.
  // this will be set on the root instance on initial mount.
  vnode.appContext = context

  // 以上的 vnode 是在 root component 创建前创建的 所以在创建 root vnode 时,
  // currentRenderingInstance 没有被设置
  // 渲染 root vnode
  // isHydrate && hydrate &&  hydrate(vnode, container)
  render(vnode, container) {
    patch(container._vnode || null, vnode, container, anchor = null, parentComponent = null) {
      const { type, ref, shapeFlag } = vnode
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
      };

      mountComponent(vnode, container, anchor, parent) {
        // inherit parent app context - or - if root, adopt from root vnode
        const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext
        const instance = createComponentInstance(initialVNode, parentComponent, parentSuspense) {
          const instance = {
            uid: uid++,
            next: null,
            vnode: vnode,
            type, vnode.type,
            subTree: null,
            parent: parent,
            appContext: appContext, // 最终继承子 rootVnode.appContext
            // state
            ctx: EMPTY_OBJ, // 下面立即设置 { _: instance }
            data: EMPTY_OBJ,
            props: EMPTY_OBJ,
            attrs: EMPTY_OBJ,
            slots: EMPTY_OBJ,
            refs: EMPTY_OBJ,
            setupState: EMPTY_OBJ,
            setupContext: null,
            // 注意这里提前创建了 scope, detached 表示不会被 外部的 effect scope 进行收集
            // 比如嵌套的组件, 但是 组件里面的 scope 是不会被外部组件的 scope 进行收集的
            // 所以外部组件调用自己的 instance.scope.stop() 不会影响到子组件,只能对自己组件的 effect 进行管理
            scope: (new EffectScope(true /* detached */) {
              this._on = 0;
              this.parent = activeEffectScope;
            }),
            render: null,
            proxy: null,
            exposed: null,
            exposeProxy: null,
            withProxy: null,

            // inheritAttrs
            inheritAttrs: vnode.type.inheritAttrs,

            ids: parent ? parent.ids : ['', 0, 0],
            // 最终继承自 appContext.provides
            provides: parent ? parent.provides : Object.create(appContext.provides),
            accessCache: null!,
            renderCache: [],

            // resolved props and emits options
            // 这里是定义在组件选项中的 props 注意和传入的 vnode.props 的区分
            // 用户传入的 props 有多中形式, 统一成对象的形式
            _h: h(
              {
                // 这里是写在组件里面, 在创建 vnode 时, 不会涉及这里
                // 只有在创建组件时, 才会设置这里面的 propsOptions
                // 组件的属性声明: propsOptions 多种写法 -> normalizePropsOptions
                props: {
                  id: Number,  // -> { type: Number }
                  ref: String, // 无效属性, 组件保留属性(key,ref_for, ref_key,...)
                  $bar: String, // 无效属性, 组件保留属性 ($ 开头的都是组件保留的属性)
                  onVnodeMounted: fn, // 无效属性, 组件保留属性
                  // 也是无效属性, 组件保留属性, 因为内部会统一 camelize 到 onVnodeMounted
                  "on-vnode-mounted": fn,
                  name: { type: String, required: true, default: ''}
                  show: { type: Boolean, default: true },
                  data: { type: Array, default: []}
                  "foo-bar": [String, Boolean], // 可以是多个类型
                  modalVale: undefined
                },
                props: ['id','name', 'show', 'data', "foo-bar"],
                // 下面的数组声明方式,是无效, vue 规定使用数组声明的属性, 元素必须全都是字符串
                props: ['modalVale', { name: { type: String, required: true, default: ''} }],

                // 组件的事件声明: emitsOptions 多种写法 -> normalizePropsOptions
                emits: ['up', 'foo-bar', 'update:modalValue', 'update:foo-bar', 'update:fooBar'],
                emits: {
                  up: null,
                  'foo-bar': () => {},
                  'update:modalValue': null,
                  'update:foo-bar': null,
                  'update:fooBar': null
                }
              },
              {
                // 传入给 vnode 的 vnode.props: rawProps, 可以包含(组件事件,组件属性,其他属性)
                id: 1, // 是否存在组件的 propsOptions 存在放入 instance.props, 不存在放入 instance.attrs
                key: 1, // 同时作为 vnode 的 key 不存在放入 instance.attrs, 存在放入 instance.props
                ref: 'i', // 同时作为 vnode 的 ref, 不存在放入 instance.attrs, 存在放入 instance.props
                foo: 'foo', // propsOptions, 不存在放入 instance.attrs, 存在放入 instance.props
                onUp: () => {},  // 传入事件 hooks 是否存在组件的 emits 中
                onVnodeMounted: fn, // 传入 vnode hooks
                // 是否存在组件的 emitsOptions 中, 不存在作为普通元素 attrs 设置到元素上面若是单个元素节点的话
                onClick: fn, // 是否存在组件的 propsOptions, 不存在放入 instance.attrs
                onclick: fn, // 是否存在组件的 propsOptions, 不存在放入 instance.attrs
                name: 'admin',  // 是否存在组件的 propsOptions, 存在放入 instance.props
                data: [1, 2, 3] // 是否存在组件的 propsOptions, 存在放入 instance.props
              }
            ),
            // props:
            _rawProps: {
              id: [String, Number, Boolean],
              bo: [Boolean, Number, String],
              data: Array,
              'foo-bar': { type: String, default: "foo" }
            },
            // =>
            // propsOptions[normalized, needCastKeys]:
            _propsOptions: [
              // normalized:
              {
                id: {
                   // 多个类型中, Boolean 在 String 前面
                    type: [Boolean, Number, String],
                    [BooleanFlags.shouldCast]: true,
                    [BooleanFlags.shouldCastTrue]: true // Boolean 在 String 前面
                },
                bo: {
                   // 多个类型中, String 在 Boolean 前面
                    type: [String, Number, Boolean],
                    [BooleanFlags.shouldCast]: true,
                    [BooleanFlags.shouldCastTrue]: false // Boolean 在 String 后面
                },
                data: {
                    type: Array,
                    [BooleanFlags.shouldCast]: false,
                    [BooleanFlags.shouldCastTrue]: true
                },
                // key 全部都变成 camelCase
                fooBar: {
                    type: String,
                    default: "foo",
                    [BooleanFlags.shouldCast]: false,
                    [BooleanFlags.shouldCastTrue]: true
                }
              },
              // needCastKeys:
              ["id", "bo", "fooBar"] // 最后一个属性放置的是: 有 Boolean 类型的属性, 或者有默认值的属性
            ],
            // NOTE:
            // 组件中声明的属性名称全部都会被为转为 camelCase
            // 同时下面 initProps 时, 也会将组件的中的属性 key 设置为 camelCase
            // instance.propsOptions 中的 key 是进行 camelize 的, 都是 camelCase
            // instance.props 中的 key 是进行 camelize 的, 都是 camelCase
            // instance.attrs 中的 key 不进行 camelize, 保持原始传入的 key
            propsOptions: normalizePropsOptions(type, appContext) => {
              const comp = type
              const cache = appContext.propsCache
              const cached = cache.get(comp)
              if (cached) {
                // 将组件声明的 props 进行 normalizePropsOptions 后, 就进行了缓存, 避免了
                // 每次创建同一个组件的不同实例, 都要进行一次 normalization 操作, 这里同一个组件的 propOptions
                // 只进行一次 normalization 操作, 后面相同的组件实例时,只从缓存中取, 避免重复的 normalization
                return cached
              }
              const raw = comp.props
              const normalized: NormalizedPropsOptions[0] = {}
              // 用于 boolean 值的转换
              const needCastKeys: NormalizedPropsOptions[1] = []

              let hasExtends = false
              if (!raw && !hasExtends) {
                // 没有组件属性声明, 则返回一个默认空数组
                //  NOTE:  normalizePropsOptions 返回的是一个数组
                if (isObject(comp)) {
                  cache.set(comp, EMPTY_ARR as any)
                }
                return EMPTY_ARR as any
              }
              // 组件声明的数组方式:
              // ["id", "foo-bar", "show"]
              // =>
              // { id: {}, fooBar: {}, show: {} }
              // 这种数组方式没有指定类型, 则没有 BooleanFlags 属性
              // NOTE: 使用数组声明, 里面元素必须都是字符串
              if (isArray(raw)) {
                for (let i = 0; i < raw.length; i++) {
                  if (__DEV__ && !isString(raw[i])) {
                    warn(`props must be strings when using array syntax.`, raw[i])
                  }
                  // 属性名统一为 驼峰命名
                  // props: ['id', 'foo-bar'] -> { id: {}, fooBar: {} }
                  // 这里的 key 也需要 normalization 就是统一格式为 camelCase
                  const normalizedKey = camelize(raw[i])
                  if (validatePropName(normalizedKey)) {
                    // 声明的属性名称不可以是 key[0] !== '$' 第一个字符是以 $ 开头
                    // 声明的属性名不可以是下面的保留字符 - 注意这里的空字符 '' 也是 vue 的保留的内部属性名
                    // // the leading comma is intentional so empty string "" is also included
                    // ',key,ref,ref_for,ref_key,' +
                    // 'onVnodeBeforeMount,onVnodeMounted,' +
                    // 'onVnodeBeforeUpdate,onVnodeUpdated,' +
                    // 'onVnodeBeforeUnmount,onVnodeUnmounted',
                    normalized[normalizedKey] = EMPTY_OBJ
                    // { id: {}, fooBar: {} }
                  }
                }
              } else if (raw) {
                if (__DEV__ && !isObject(raw)) {
                  warn(`invalid props options`, raw)
                }
                // 注意在 for in 中 这里的 raw 即使是 undefined/null 都不会报错
                // for (const key in '') {}
                // for (const key in null) {}
                // for (const key in undefined) {} 都不会报错
                for (const key in raw) {
                  // 首先是 key 的 normalization, 转为驼峰命名
                  const normalizedKey = camelize(key)
                  // 不是一下的有效属性名, 直接返回
                  if (!validatePropName(normalizedKey)) return
                  // 声明的属性名称不可以是 key[0] !== '$' 第一个字符是以 $ 开头
                  // 声明的属性名不可以是下面的保留字符 - 注意这里的空字符 '' 也是 vue 的保留的内部属性名
                  // // the leading comma is intentional so empty string "" is also included
                  // ',key,ref,ref_for,ref_key,' +
                  // 'onVnodeBeforeMount,onVnodeMounted,' +
                  // 'onVnodeBeforeUpdate,onVnodeUpdated,' +
                  // 'onVnodeBeforeUnmount,onVnodeUnmounted',
                  // props: { id: [String, Number], data: Array,  'foo-bar': { type: String } }
                  //              isArray                 isFunction         otherwise
                  const opt = raw[key]
                  // 每个属性可以是 数组, 类型函数(String,Boolean,Number,Array, ...), 对象
                  const props = isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt))
                  // 最终转为对象形式: { id: { type: [String, Number] }, data: { type: Array }}
                  normalized[normalizedKey] = props
                  const propType = prop.type
                  let shouldCast = false // 应该类型转换
                  let shouldCastTrue = true // 类型转换到 true
                  if (isArray(propType)) {
                    // 属性类型有多种, 若是其中有 Boolean, 则应设置 shouldCast 为 true
                    // { id: [String, Number] }, propType = [String, Number]
                    for (let index = 0; index < propType.length; ++index) {
                      const type = propType[index]
                      const typeName = isFunction(type) && type.name
                      if (typeName === 'Boolean') {
                        // 只要先碰到 bool 类型 表示需要进行类型转换
                        shouldCast = true
                        break // 直接终止遍历
                      } else if (typeName === 'String') {
                        // If we find `String` before `Boolean`, e.g. `[String, Boolean]`,
                        // we need to handle the casting slightly differently. Props
                        // passed as `<Comp checked="">` or `<Comp checked="checked">`
                        // will either be treated as strings or converted to a boolean
                        // `true`, depending on the order of the types.
                        // 表示在多个类型中, String 在 Boolean 前面
                        shouldCastTrue = false
                      }
                    }
                  } else {
                    // 类型只有一种 并且类型是 Boolean, 那么 shouldCast 为 true
                    shouldCast = isFunction(propType) && propType.name === 'Boolean'
                  }

                  // Boolean: shouldCast = true, shouldCastTrue = true
                  // [Boolean, String]: shouldCast = true, shouldCastTrue = true
                  // [String, Boolean]: shouldCast = true, shouldCastTrue = false
                  // [String, !Boolean]: shouldCast = false, shouldCastTrue = false
                  // other: shouldCast = false, shouldCastTrue = true
                  // 为属性设置标识
                  prop[BooleanFlags.shouldCast] = shouldCast // 为 true, 属性有 Boolean 类型
                  prop[BooleanFlags.shouldCastTrue] = shouldCastTrue
                  // 为 true ->  [Boolean, String]
                  // 为 false -> [String,  Boolean]
                  // if the prop needs boolean casting or default value
                  if (shouldCast || hasOwn(prop, 'default')) {
                    // 表示有默认值的属性或者是有类型有 Boolean 属性
                    needCastKeys.push(normalizedKey)
                  }
                }
              };
              {
                // {
                //   id: [String, Number, Boolean],
                //   bo: [Boolean, Number, String],
                //   data: Array,
                //   'foo-bar': { type: String, default: "foo" }
                // }
                // =>
                // [
                //   {
                //     id: {
                //        // 多个类型中, Boolean 在 String 前面
                //        type: [Boolean, Number, String],
                //        [BooleanFlags.shouldCast]: true,
                //        [BooleanFlags.shouldCastTrue]: true // Boolean 在 String 前面
                //     },
                //     bo: {
                //        // 多个类型中, String 在 Boolean 前面
                //        type: [String, Number, Boolean],
                //        [BooleanFlags.shouldCast]: true,
                //        [BooleanFlags.shouldCastTrue]: false // Boolean 在 String 后面
                //     },
                //     data: {
                //        type: Array,
                //        [BooleanFlags.shouldCast]: false,
                //        [BooleanFlags.shouldCastTrue]: true
                //     },
                //     // key 全部都变成 camelCase
                //     fooBar: {
                //        type: String,
                //        default: "foo",
                //        [BooleanFlags.shouldCast]: false,
                //        [BooleanFlags.shouldCastTrue]: true
                //     }
                //   },
                //   ["id", "bo", "fooBar"] // 最后一个属性放置的是: 有 Boolean 类型的属性, 或者有默认值的属性
                // ]
              };
              const res: NormalizedPropsOptions = [normalized, needCastKeys]
              if (isObject(comp)) {
                cache.set(comp, res)
              }
              return res
            },
            // 定义组件暴露的事件函数, 当执行 emit('name') 需要满足时 emits 中定义的事件名称
            emitsOptions: normalizeEmitsOptions(type, appContext) => {
              const comp = type
              const cache = appContext.emitsCache
              const cached = cache.get(comp)
              if (cached !== undefined) {
                return cached
              }
              // emits: ['up', 'foo-bar', 'update:modalValue', 'update:foo-bar', 'update:fooBar']
              // =>
              // emits: {
              //   up: null,
              //   'foo-bar': () => {},
              //   'update:modalValue': null,
              //   'update:foo-bar': null,
              //   'update:fooBar': null
              // }
              const raw = comp.emits
              let normalized: ObjectEmitsOptions = {}
              if (isArray(raw)) {
                raw.forEach(key => (normalized[key] = null))
              } else {
                extend(normalized, raw)
              }
              if (isObject(comp)) {
                cache.set(comp, normalized)
              }
              return normalized
            },
          }
          if (__DEV__) {
            instance.ctx = createDevRenderContext(instance)
          } else {
            instance.ctx = { _: instance }
          }
          instance.root = parent ? parent.root : instance
          instance.emit = emit.bind(null, instance) => {
            // 调用传入到 instance 中 props 中事件对应的函数
            // <Foo v-on:my-event="onEvent">
            // h(Foo, { onMyEvent: onEvent })
            // const onEvent = (a, b, c) => { }
            // instance.emit('my-event', 1, 2, 3) -> instance.props.onMyEvent(1, 2, 3)
          }
          return instance
        }
        vnode.component = instance;

        // resolve props and slots for setup context
        setupComponent(instance, false, optimized) => {
          const isStateful = isStatefulComponent(instance) => {};
          const { props, children } = instance.vnode;
          // instance.propsOptions 中的 key 是进行 camelize 的, 都是 camelCase
          // props 属性的读取都是统一转成 camelCase, 而 attrs 中则没有转换
          // NOTE:
          // instance.props 中的 key 是进行 camelize 的, 都是 camelCase
          // instance.attrs 中的 key 不进行 camelize, 保持原始传入的 key
          initProps(instance, instance.vnode.props, isStateful, isSSR) {
            // rawProps -> instance.props 表示创建 vnode 时传入的 Props
            // h(Foo, rawProps, children), 这里的 rawProps 内部可以传入任意的属性,
            // 需要将 rawProps 进行抽取 若是满足 propsOptions 中需要放入 props, 否在放入 attrs
            // h({ props: ['a', 'd']},           {a: 0, b: 1, c: 2})
            //     | 组件声明的属性(propsOptions)   传入的 vnode.props -> rawProps
            // rawProps(propsOptions) ->
            //  props: { a: 0 },
            //  attrs: { b: 1, c: 2 }
            const rawProps = instance.vnode.props // 传入 vnode 中的 props
            const props: Data = {}
            const attrs: Data = createInternalObject()

            instance.propsDefaults = Object.create(null)

            setFullProps(instance, rawProps, props, attrs) {
              // rawProps: { id: 0,  data: [], "foo-bar": '1', 'bar-foo': '2', onUp: fn }
              // instance.propsOptions 在函数总 createComponentInstance() 中设置
              // {
              //   id: [String, Number, Boolean],
              //   bo: [Boolean, Number, String],
              //   data: Array,
              //   'foo-bar': { type: String, default: "foo" }
              // }
              // =>
              // [
              //   {
              //     id: {
              //        // 多个类型中, Boolean 在 String 前面
              //        type: [Boolean, Number, String],
              //        [BooleanFlags.shouldCast]: true,
              //        [BooleanFlags.shouldCastTrue]: true // Boolean 在 String 前面
              //     },
              //     bo: {
              //        // 多个类型中, String 在 Boolean 前面
              //        type: [String, Number, Boolean],
              //        [BooleanFlags.shouldCast]: true,
              //        [BooleanFlags.shouldCastTrue]: false // Boolean 在 String 后面
              //     },
              //     data: {
              //        type: Array,
              //        [BooleanFlags.shouldCast]: false,
              //        [BooleanFlags.shouldCastTrue]: true
              //     },
              //     // key 全部都变成 camelCase
              //     fooBar: {
              //        type: String,
              //        default: "foo",
              //        [BooleanFlags.shouldCast]: false,
              //        [BooleanFlags.shouldCastTrue]: true
              //     }
              //   },
              //   ["id", "bo", "fooBar"] // 最后一个属性放置的是: 有 Boolean 类型的属性, 或者有默认值的属性
              // ]
              const rawProps = instance.vnode.props
              const [options, needCastKeys] = instance.propsOptions
              let hasAttrsChanged = false
              let rawCastValues: Data | undefined

              if (!rawProps) return false

              for (let key in rawProps) {
                // key, ref are reserved and never passed down
                if (isReservedProp(key)) {
                  continue
                }
                // key: 'foo-bar'
                const value = rawProps[key]
                // 用户传入的 key 可以是任意格式, 这里统一将其设置为 camelCase
                // prop option names are camelized during normalization, so to support
                // kebab -> camel conversion here we need to camelize the key.
                let camelKey = camelize(key) // foo-bar -> fooBar
                if (options && hasOwn(options, (camelKey = camelize(key)))) {
                  // 用户传入的属性 key 属于组件声明的属性,那么设置到 props 中, 注意是以 camelCase 设置的
                  if (!needCastKeys || !needCastKeys.includes(camelKey)) {
                    // rawProps: { id: 0,  data: [], "foo-bar": '1', 'bar-foo': '2', onUp: fn }
                    // 这里的 camelKey 是在遍历 rawProps 传入的 key, 但是这里在 options 中定义的 key `bo`
                    // 没有传入进来
                    // needCastKeys = ["id", "bo", "fooBar"]
                    // options: { id, data, bo, fooBar}
                    props[camelKey] = value
                    // props = { data: [] }
                  } else {
                    // needCastKeys 表示属性有多个类型(包含Boolean 类型) 或者默认值
                    // rawCastValues = { id: 0, fooBar: '1' }
                    // 这里因为 rawProps 没有传入 'bo' 这个属性,
                    // 此时这里的 rawCastValues 则不会包含 `bo` 属性, 所以此时的 属性 'bo' 即使 `absent`
                    ;(rawCastValues || (rawCastValues = {}))[camelKey] = value
                  }
                } else if (!isEmitListener(instance.emitsOptions, key)) {
                  // 执行到这里说明 key 不在组件声明的属性中, 那么余下来的 key 就还可能是 emitsOptions 的 key
                  // 比如用户传入了 onFooBar 的属性 key, 若是去除了 on 的属性 fooBar 存在于 emitsOptions 中,
                  // 那么就表示此 key 是属于 emitsOptions 的事件 key, 此时不应放入 attrs 中
                  // Any non-declared (either as a prop or an emitted event) props are put
                  // into a separate `attrs` object for spreading. Make sure to preserve
                  // original key casing
                  // 任何非声明的属性: 既不是属性也不是发射的事件放入 attrs 中, 其 key 不进行 camelCase 转换
                  // attrs 中 key 没有转 camelCase, 保持原来的 key 形式
                  if (!(key in attrs) || value !== attrs[key]) {
                    // 这里赋值时, 有比较值是否变化, 若是变化, 这里设置 hasAttrsChanged 为 true
                    attrs[key] = value
                    // attrs = { 'bar-foo': "2" }
                    hasAttrsChanged = true
                  }
                }
              }
              // needCastKeys 存在, rawCastValues 中的值要进行类型转换赋值到 props 中
              // needCastKeys = ["id", "bo", "fooBar"]
              // rawCastValues = { id: 0, fooBar: '1' }
              // 处理属性默认值
              if (needCastKeys) {
                // needCastKeys 包含有默认值的属性与需要类型转换的属性(含有 boolean)
                const rawCurrentProps = toRaw(props)
                const castValues = rawCastValues || EMPTY_OBJ
                for (let i = 0; i < needCastKeys.length; i++) {
                  const key = needCastKeys[i] // id, bo, fooBar
                  props[key] = resolvePropValue(
                    options!,
                    rawCurrentProps,
                    key,
                    castValues[key],
                    instance,
                    /* 什么场景会出现 isAbsent ?
                    * 当传入的 rawProps: { id: 0,  data: [], "foo-bar": '1', 'bar-foo': '2' }
                    * 并没有包括组件声明的中属性时, 比如这里的 'bo'
                    * 而 needCastKeys = ["id", "bo", "fooBar"] 是包括 'bo'
                    * rawCastValues = { id: 0, fooBar: '1' } 不包括 'bo'
                    * 所以这里的 bo 是 isAbsent 的
                    */,
                    !hasOwn(castValues, key)/* isAbsent  */
                  ) {
                    const isAbsent = !hasOwn(castValues, key)
                    const value = castValues[key]
                    const props = rawCurrentProps
                    const options = options
                    const opt = options[key]
                    if(!opt) return
                    const hasDefault = hasOwn(opt, 'default')
                    // default values
                    if (hasDefault && value === undefined) {
                      // 有默认值, 并且传入的 value 不等于 undefined, 才进行默认值的设置
                      const defaultValue = opt.default
                      if (
                         // defaultValue 可以是一个函数
                        isFunction(defaultValue)&&
                        // 当 defaultValue 为函数时 就不可以设置属性类型, 与属性类型是互斥的
                        // 当 defaultValue 为函数, 同时又有设置类型 type 时, 那么此时 type 类型优先
                        // 不会执行默认值函数
                        opt.type !== Function &&
                        !opt.skipFactory
                      ) {
                        const { propsDefaults } = instance
                        if (key in propsDefaults) {
                          // 若是执行过一次属性默认值函数, 直接缓存中读取, 不在继续执行
                          value = propsDefaults[key]
                        } else {
                          const reset = setCurrentInstance(instance)
                          // 执行属性默认值函数, 并且缓存到 instance.propsDefaults 中,
                          // 下次继续执行时, 从缓存中读取
                          value = propsDefaults[key] = defaultValue.call(null, props)
                          reset()
                        }
                      } else {
                        value = defaultValue
                      }
                      // #9006 reflect default value on custom element
                      if (instance.ce) {
                        instance.ce._setProp(key, value)
                      }
                    }
                    // 以上默认值已经设置

                    // boolean casting
                    if (opt[BooleanFlags.shouldCast]) {
                      // 属性有 Boolean 类型
                      if (isAbsent && !hasDefault) {
                        // isAbsent 表示传入的 rawProps 即 instance.vnode.props
                        // 中没有传入在组件 propsOptions 声明的属性,
                        // 同时这个属性是有 Boolean 类型的 并且没有默认值, 那么将其值设置为 false
                        value = false
                      } else if (
                        // [String, Boolean] - Stirng 在 Boolean 前面
                        // 那么空字符会被转为 true, 或者是 value 与 key 相同会被设置为 true
                        opt[BooleanFlags.shouldCastTrue] &&
                        (value === '' || value === hyphenate(key))
                      ) {
                        value = true
                      }
                    }
                    return value
                  }
                }
              }
              return hasAttrsChanged
            }

            // ensure all declared prop keys are present
            // [NormalizedProps, string[]] | []
            for (const key in instance.propsOptions[0]) {
              if (!(key in props)) {
                // 上面的 'd' 不在 { a: 0 } 故这里需要将组件声明的 d 属性放入 props, 即使用户没有传入
                props[key] = undefined
              }
            }
            // props: { a: 0, d: undefined }

            // validation
            if (__DEV__) {
              validateProps(rawProps || {}, props, instance)
            }

            // 初始化时, 将传入的 props 进行响应式处理:
            // 此时所有的属性默认值也已经执行了
            instance.props = shallowReactive(props)

            // 排除了属性中传入的 事件 prop
            instance.attrs = attrs
          }
          // instance.slots = {}
          // 这里对传入组件的 slots 进行初始化, 其中 slots 来源分为 2 部分:
          // 1. 来自 vue 模板编译生成的 slots, 其中 slot 函数都是使用 withCtx 包装了, 其有 .c 标识为 true
          // 2. 来自 vue h()函数生成的 slots, 此时需要对象 slots 进行 normalization, 最后的函数的 .c 标识为 false
          // 通过返回的 slot 函数的 `.c` 标识来区分是具体某个 slot 来自 h 函数, 还是来自模板编译生成的 slot 函数
          // 总之, 最后都是 normalization 过的 slot 函数, 其 slot 函数返回值都被转成了数组
          // instance.slots = createInternalObject()
          // 下面修改的 slot 都是在修改 instance.slots
          // children 在 vnode 阶段, 就称为 children (可以是各种类型string, array, object)
          // children 在 instance 阶段, 就成为 slots (此时必须是对象函数形式,函数返回值必须为数组)
          initSlots(instance, instance.vnode.children, optimized) {
            const slots = createInternalObject()
            instance.slots = slots
            // 这里的 children 为 null, 直接返回不进行处理, instance.slots = {}
            // HINT: 这里的 ShapeFlags.SLOTS_CHILDREN 保证了 children 不会是 null
            if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
              // 传入 children 为对象
              const type = (children as RawSlots)._
              if (type) {
                // compiled slots.
                // - 有 `_` 属性
                // - 有 `_withCtx` 包装后, `foo._c`, `default._c` 这些函数都是有 `._c` 标识
                // - 无需 normalization (因为在编译器AST生成代码阶段已经进行了 normalization)
                // {
                //   foo: _withCtx(() => [...]), // .c -> true
                //   bar: _withCtx(() => [...]), // .c -> true
                //   car: _withCtx(() => [...]), // .c -> true
                //   default: _withCtx(() => [...]), // .c -> true
                //   _: SlotFlags // ._ -> true
                // }
                // optimized: 默认值为: !!n2.dynamicChildren
                assignSlots(slots, children as Slots, optimized)
                // make compiler marker non-enumerable
                if (optimized) {
                  def(slots, '_', type, true)
                }
              } else {
                // h(Foo, null, {
                //   foo: 1,
                //   bar: () => 2,
                //   car: () => [1, 'txt', null, vnode],
                //   default: () => null
                // })
                // ==>
                // h(Foo, null, {
                //   foo: () => normalizeSlotValue(1), // .c -> false
                //   bar: normalizeSlot(withCtx(() => normalizeSlotValue(bar()))), // .c -> false
                //   car: normalizeSlot(withCtx(() => normalizeSlotValue(car()))), // .c -> false
                //   default: normalizeSlot(withCtx(() => normalizeSlotValue(default()))) // .c -> false
                // })

                // normalizeSlotValue() -> 总是返回数组, 也就是最终的 slots 函数的返回值都要转为数组

                // NOTE: 这里的 传入 normalizeObjectSlots 的 children 可以为 null/undefined, 因为
                // for (const key in null) {} 不会报错
                // for (const key in null) {} 也不会报错
                // 手写 render 函数传入的 slots
                normalizeObjectSlots(children, slots, instance)(){
                  const rawSlots = children
                  // ctx -> currentRenderingInstance
                  // 这里的 _ctx 在创建 vnode 时设置于 normalizeChildren 函数中
                  // for tracking slot owner instance. This is attached during
                  // normalizeChildren when the component vnode is created.
                  // _ctx 在组件 vnode 创建时:
                  // 在 normalizeChildren 函数中将 currentRenderingInstance 设置到 children._ctx 上
                  const ctx = rawSlots._ctx;
                  // 注意这里的 rawSlots 可以为 null/undefined, 因为
                  // for (const key in null) {} 不会报错
                  // for (const key in null) {} 也不会报错
                  for (const key in rawSlots) {
                    // 排除 _, $stable
                    if (isInternalKey(key)) continue;
                    const value = rawSlots[key];
                    if (isFunction(value)) {
                      // 对 slot 函数进行包装
                      // normalizeSlot h 函数中调用的, 里面也是调用了 withCtx, 但是将 withCtx 返回的函数中的
                      // normalized._c 重置为 false
                      instance.slots[key] = normalizeSlot(key, value, ctx) {
                        const rawSlot = value;
                        const normalized = withCtx(
                          fn = (...args: any[]) => {
                            return normalizeSlotValue(rawSlot(...args))
                          }
                        ){
                          if (!ctx) return fn
                          const renderFnWithContext: ContextualRenderFn = (...args: any[]) => {
                            if (renderFnWithContext._d) {
                              setBlockTracking(-1)
                            }
                            const prevInstance = setCurrentRenderingInstance(ctx)
                            let res
                            try {
                              res = fn(...args)
                            } finally {
                              setCurrentRenderingInstance(prevInstance)
                              if (renderFnWithContext._d) {
                                setBlockTracking(1)
                              }
                            }
                            return res
                          }
                          // mark normalized to avoid duplicated wrapping
                          renderFnWithContext._n = true
                          // mark this as compiled by default
                          // this is used in vnode.ts
                          // -> normalizeChildren() to set the slot rendering flag.
                          renderFnWithContext._c = true
                          // disable block tracking by default
                          renderFnWithContext._d = true
                          return renderFnWithContext
                        }
                        // h 函数中通过 normalizeSlot() 会显式的设置
                        // withCtx 包装的 slot 函数的 `.c` 标识为 false, 以便将模板编译中调用的 withCtx 设置
                        // 经过 withCtx 标识的 `.c` 为 true, 进行区分.
                        // slot._c 为 true, 表示来自模板编译调用的 withCtx 包装的 slot 函数
                        // slot._c 为 false, 表示不是来自模板编译,而是通过 h函数传入的 slots,
                        //调用的 withCtx 包装的 slot 函数
                        // NOT a compiled slot
                        ;(normalized as ContextualRenderFn)._c = false
                        return normalized
                      };
                    } else if (children) { {
                      // h(Foo, null, null)
                      // -> h(Foo, null, { default: () => normalizeSlotValue(null)})
                      // h(Foo, null, 'hi')
                      // -> h(Foo, null, { default: () => normalizeSlotValue('hi')})
                      // h(Foo, null, ['hi', null])
                      // -> h(Foo, null, { default: () => normalizeSlotValue(['hi', null])})
                      // children 不是对象,
                      // 默认设置到 instance.slots.default = normalizeSlotValue(children)
                      // ShapeFlags.TEXT_CHILDREN
                      //  - normalizeVNode('text')
                      // ShapeFlags.ARRAY_CHILDREN
                      //  - [normalizeVNode(vnode), normalizeVNode(Text), normalizeVNode('txt'), ..]
                      normalizeVNodeSlots(instance, children) {
                        const normalized = normalizeSlotValue(children) {
                          return isArray(children)
                            ? value.map(normalizeVNode)
                            : [normalizeVNode(value as VNodeChild)]
                        }
                        instance.slots.default = () => normalized
                      }
                    }
                  }
                }
              }
            } else if (children) {
              // 不是对象, 统一将其设置到 default 中
              const normalized = normalizeSlotValue(children)
              instance.slots.default = () => normalized
            }
          }
          // 注意第一个根组件执行到此处时,还没有设置 currentInstance, currentRenderingInstance
          const setupResult = isStateful ? setupStatefulComponent(instance, isSSR){
            const Component = instance.type as ComponentOptions
            // 0. create render proxy property access cache
            instance.accessCache = Object.create(null) // 用户缓存优化 hasOwn 函数
            // 1. create public instance / render proxy
            // 模板, render 函数中访问的变量 x 会直接加上 proxy.x 前缀
            // instance.proxy.key -> instance.ctx.key
            instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers => ({
              get(target, key) {
                const instance = target._
                // accessCache 的创建就是在 setupStatefulComponent()
                // 即: instance.accessCache = Object.create(null)
                const { ctx, setupState, data, props, accessCache, type, appContext } = instance
                // proxy.xxx 取值顺序:
                // 1. instance.setupState.xxx ->
                // 2. instance.data.xxx ->
                // 3. instance.props.xxx ->
                // 4. instance.ctx.xxx
                // 由于是在 `<h1>{{ proxy.xxx }}</h1>` (组件的 render)中, 会被频繁的读取
                // 每次都会执行判断 hasOwn(target, key), 因为执行这两个 hasOwn 判断很费性能
                // 所以这里将 hasOwn(target, key) 读取过的缓存结果进行缓存, 下次读取就不再需要再次执行 hasOwn 了
                // 直接从目标对象读取 -> target(key)
                // 这里的缓存主要是优化每次读取执行 hasOwn 的问题
                if (key[0] !== '$') {
                  const n = accessCache![key]
                  if (n !== undefined) {
                    // 有缓存 读取过 hasOwn 不在执行 hasOwn 操作
                    switch (n) {
                      case AccessTypes.SETUP:
                        return setupState[key]
                      case AccessTypes.DATA:
                        return data[key]
                      case AccessTypes.CONTEXT:
                        return ctx[key]
                      case AccessTypes.PROPS:
                        return props![key]
                      // default: just fallthrough
                    }
                  } else {
                    // 没有缓存 proxy.xxx 存在于 setup() 返回的对象之中
                    // setupState.xxx 优先级最高
                    if((hasSetupBinding(setupState, key) => {
                      return setupState !== EMPTY_OBJ && !setupState.__isScriptSetup && hasOwn(setupState, key)
                    })) {
                      // setupState 在后面的 handleSetupResult() 设置
                      // instance.setupState = proxyRefs(setupResult)
                      accessCache![key] = AccessTypes.SETUP
                      return setupState[key];
                    } else if(data !== EMPTY_OBJ && hasOwn(data, key)) {
                      // instance.data 在 finishComponentSetup -> applyOptions 中设置
                      // instance.data = reactive(data)
                      accessCache![key] = AccessTypes.DATA
                      return data[key]
                    } else if(hasOwn(props, key)) {
                      accessCache![key] = AccessTypes.PROPS
                      return props![key]
                    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
                      // instance.ctx = { _: instance, key: foo }
                      accessCache![key] = AccessTypes.CONTEXT
                      return ctx[key]
                    } else if (!__FEATURE_OPTIONS_API__ || shouldCacheAccess) {
                      accessCache![key] = AccessTypes.OTHER
                    }
                  }
                }
              },
              set(target, key, value) {
                const instance = target._
                const { data, setupState, ctx } = instance
                if (hasSetupBinding(setupState, key)) {
                  setupState[key] = value
                  return true
                } else if (hasOwn(instance.props, key)) {
                  __DEV__ && warn(`Attempting to mutate prop "${key}". Props are readonly.`)
                  // 设置属性失败, 返回 false
                  return false
                } else {
                  // 最终设置到 instance.ctx.[key] 中
                  ctx[key] = value
                }
                return true
              })
            });
            // 2. call setup()
            const { setup } = Component;
            if (setup) {
              pauseTracking()
              const setupContext = createSetupContext(instance) => {
                // expose 通过 setup 函数参数暴露
                // 用户在组件 sestup 函数中调用暴露出的 expose({}) 传入对象进去给 instance.exposed 设置值
                const expose: SetupContext['expose'] = exposed => {
                  instance.exposed = exposed || {}
                };
                return {
                  expose,
                  emit: instance.emit,
                  attrs: instance.attrs,
                  slots: instance.slots,
                }
              }
              instance.setupContext = setupContext;
              // 设置 currentInstance, 但是此时的 currentRenderingInstance 还未设置
              // 若是根组件, 那么此时的 currentRenderingInstance 还未设置
              // 如是子组件, 那么此时的 currentRenderingInstance 已经设置,
              // 就是父组件在创建 subTree 时, 已经设置了 currentRenderingInstance
              const reset = setCurrentInstance(instance);
              // 执行 setup 函数
              // setup(props, { emit, slots, attrs, expose }) {}
              const setupResult = setup(instance.props, setupContext) => {
                // 用户组件 setup 函数的业务代码:

                // 获取用户传入的 props 值 或者组件声明属性的默认执行
                const props = instance.props
                // 获取传入的 slots, attrs,
                // 其中 emit, expose 为绑定组件实例的函数
                // emit('event')
                //  -> 去查找父组件传给当前组件的 props 查找对应的事件绑定的函数
                // expose({...})
                //  -> instance.exposed = {} -> 其他组件通过 ref 获取对象就是这里的 expose 传入的对象值
                const { emit, slots, attrs, expose } = setupContext

                // 到这里 slots 一定是对象, 因为前面的 initSlots 已经处理了
                // slots.bar._c 可以判断出 是否来自 编译 slot, 还是用户手写的 slot

                // issues: https://github.com/vuejs/core/issues/2043
                // 同时在父组件中依赖 ctx.mgs.value
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
                        // 组件的 job 都是有设置 ALLOW_RECURSE 标识,在创建组件时就已经设置了,
                        // 故后面在子组件创建(setup)/更新(update)中触发的 dep.trigger() 都是可以将
                        // parentJob 重复加入到队列中的,
                        // 同时要意识,子组件的创建/更新都是在父组件的 job 中执行触发的.
                        // 因为这里 parentJob.ALLOW_RECURSE, 所以可以重复插入自己到队列中
                        // [parentJob, parentJob, childJob]
                        //  | flushingIndex
                        // 当前的 parentJob 执行完后, 继续执行下一个 job, 又是 parentJob 自己
                        // [parentJob, parentJob, childJob]
                        //             | flushingIndex
                        // 这样就又开始递归执行自己, 再次执行到 ctx.msg.value = 'updated', 此时的赋值操作
                        // 前后值相同, 则不会触发 dep.trigger -> queueuJob 就不会继续插队执行了,
                        // 而是执行队列下一个 job
                      }
                    }
                  }
                }

                // instance.bm.push(() => fn())
                // onBeforeMount(() => {
                //   ctx.msg.value = 'updated'
                // })

                // instance.bu.push(() => fn())
                onBeforeUpdate(() => {})

                // instance.u.push(() => fn())
                // 生命周期钩子函数注册: 会使用包装函数来进行传入参数 instance 闭包的捕获
                onUpdated(() => {
                  // 会在 setup 函数执行完后执行, 这里传入执行时捕获的参数 在setup 执行中 instance 到 传入的
                  // 回调函数中, 即使 setup 执行完后, 重置了 currentInstance, 此时在此处的回调函数执行时
                  // 依然可以访问到 currentInstance
                }, instance = getCurrentInstance())

                // instance.m.push(() => fn())
                onMounted(() => {})
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
              };
              // setup 函数执行完后恢复上下文
              resetTracking();
              reset(); // 重置 currentInstance
              // 设置 instance.render or instance.setupState
              handleSetupResult(instance, setupResult, isSSR) {
                // setup 函数执行后, 返回一个函数
                if (isFunction(setupResult)) {
                  instance.render = setupResult
                } else if (isObject(setupResult)) {
                  // NOTE: 这里将返回的对象进行 proxyRefs
                  // {a: 1} -> proxy.a -> proxy.a.value
                  // 这样在模板中访问 proxy.a 会自动代理返回 proxy.a.value 的值
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
                  // 选项式 API 其实就是内部将其放在 setup 函数后面执行选项定义的函数,比如 watch()
                  // 就是将选项中的 options.watch() 放在 setup 函数内执行, 这个与直接从
                  // import { watch } from 'vue'
                  // setup() {
                  //   watch() // 组合式 api
                  //   options.watch() // 将选项中定义的 watch 提取出来也放在 setup 函数执行
                  //   // 所以本质上, 选项式 API 其实内部就是基于组合式 API 实现的
                  // }
                  // support for 2.x options
                  if (__FEATURE_OPTIONS_API__ && !(__COMPAT__ && skipOptions)) {
                    const reset = setCurrentInstance(instance)
                    pauseTracking()
                    try {
                      applyOptions(instance)
                    } finally {
                      resetTracking()
                      reset()
                    }
                  }
                }
              }
            } else {
              finishComponentSetup() {
                // support for 2.x options
                if (__FEATURE_OPTIONS_API__ && !(__COMPAT__ && skipOptions)) {
                  const reset = setCurrentInstance(instance)
                  pauseTracking()
                  try {
                    applyOptions(instance)
                  } finally {
                    resetTracking()
                    reset()
                  }
                }
              }
            }
          } : null
        };

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
                const { propsOptions: [propsOptions] } = instance
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
                    // 默认 fallthroughAttrs 为 attrs
                    fallthroughAttrs = attrs
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
                // 注意这里的 result 是 subTree, 可能是单个根节点, 或者多个节点
                let root = result
                const isModelListener = (key) => key.startsWith('onUpdate:')
                // attr merging
                // 创建完组件的 subTree 后,
                // 若是还多出一些属性, 那么就需要 对 subTree 设置一些额外的属性, 并不是直接返回
                // 这里修改/设置新的属性会影响 vnode.ref, vnode.props 里面新增的属性可能不是经过 normalized 的
                // 故还要进行某些属性的 normalized, 所以这里使用 cloneNode 的方式会更快一些
                if (fallthroughAttrs && inheritAttrs !== false) {
                  // inheritAttrs 默认为 undefined 故若是没有显式的设置 false,
                  // 那么默认 inheritAttrs 为 undefined 即 inheritAttrs 执行属性 fallthroughAttrs
                  // 到子节点, 这里若是无必要, 最好显式的设置 inheritAttrs 为 false, 可以提升一点性能
                  const keys = Object.keys(fallthroughAttrs)
                  const { shapeFlag } = root
                  // 如 fallthroughAttrs 有属性
                  if (keys.length) {
                    // subTree 为单个节点(组件vnode 或者元素vnode)
                    if (shapeFlag & (ShapeFlags.ELEMENT | ShapeFlags.COMPONENT)) {
                      if (propsOptions && keys.some(isModelListener)) {
                        // If a v-model listener (onUpdate:xxx) has a corresponding declared
                        // prop, it indicates this component expects to handle v-model and
                        // it should not fallthrough.
                        // related: #1543, #1643, #1989
                        fallthroughAttrs = filterModelListeners(
                          fallthroughAttrs,
                          propsOptions,
                        )
                      };
                      // 这里是 cloneVNode 的使用场景之一:
                      // 将来自组件 vnode 的一些属性 (instance.attrs) 设置到组件的子节点 vnode 上
                      // 给组件的子节点 root 设置一些来自组件中的属性
                      root = cloneVNode(root, fallthroughAttrs, false, true) {
                        const vnode = root
                        const extraProps = fallthroughAttrs
                        const mergeRef = false
                        const cloneTransition = true
                        // This is intentionally NOT using spread or extend to avoid the runtime
                        // key enumeration cost.
                        const { props, ref, patchFlag, children, transition } = vnode
                        const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props
                        const cloned = {
                          __v_isVNode: true,
                          __v_skip: true,
                          type: vnode.type,
                          props: mergedProps,
                          key: mergedProps && normalizeKey(mergedProps),
                          ref:
                            // { i: currentRenderingInstance, r: ref, k: ref_key, f: !!ref_for }
                            // extraProps 是来自父组件 vnode 中属性, 若是有 ref
                            extraProps && extraProps.ref
                              ? // #2078 in the case of <component :is="vnode" ref="extra"/>
                                // if the vnode itself already has a ref, cloneVNode will need to merge
                                // the refs so the single vnode can be set on multiple refs
                                mergeRef && ref
                                ? isArray(ref)
                                  ? ref.concat(normalizeRef(extraProps)!)
                                  : [ref, normalizeRef(extraProps)!]
                                : normalizeRef(extraProps)
                              : ref,
                          children: children,
                          shapeFlag: vnode.shapeFlag,
                          // if the vnode is cloned with extra props, we can no longer assume its
                          // existing patch flag to be reliable and need to add the FULL_PROPS flag.
                          // note: preserve flag for fragments since they use the flag for children
                          // fast paths only.
                          patchFlag:
                            extraProps && vnode.type !== Fragment
                              ? patchFlag === PatchFlags.CACHED // hoisted node
                                ? PatchFlags.FULL_PROPS
                                : patchFlag | PatchFlags.FULL_PROPS
                              : patchFlag,
                          dynamicProps: vnode.dynamicProps,
                          dynamicChildren: vnode.dynamicChildren,
                          appContext: vnode.appContext,
                          dirs: vnode.dirs,
                          transition,

                          // These should technically only be non-null on mounted VNodes. However,
                          // they *should* be copied for kept-alive vnodes. So we just always copy
                          // them since them being non-null during a mount doesn't affect the logic as
                          // they will simply be overwritten.
                          component: vnode.component,
                          suspense: vnode.suspense,
                          ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
                          ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
                          el: vnode.el,
                          anchor: vnode.anchor,
                          ctx: vnode.ctx,
                          ce: vnode.ce,
                        }
                        // if the vnode will be replaced by the cloned one, it is necessary
                        // to clone the transition to ensure that the vnode referenced within
                        // the transition hooks is fresh.
                        if (transition && cloneTransition) {
                          setTransitionHooks(
                            cloned as VNode,
                            transition.clone(cloned as VNode) as TransitionHooks,
                          )
                        }
                        return cloned
                      };
                    } else if (__DEV__ && !accessedAttrs && root.type !== Comment) {
                      // 组件 subTree 不是单个节点不进行 fallthroughAttrs
                      const allAttrs = Object.keys(attrs)
                      const eventAttrs: string[] = []
                      const extraAttrs: string[] = []
                      extraAttrs.length && warn(
                        `Extraneous non-props attributes (` +
                          `${extraAttrs.join(', ')}) ` +
                          `were passed to component but could not be automatically inherited ` +
                          `because component renders fragment or text or teleport root nodes.`,
                      )
                      eventAttrs.length && warn(
                        `Extraneous non-emits event listeners (` +
                          `${eventAttrs.join(', ')}) ` +
                          `were passed to component but could not be automatically inherited ` +
                          `because component renders fragment or text root nodes. ` +
                          `If the listener is intended to be a component custom event listener only, ` +
                          `declare it using the "emits" option.`,
                      )
                    }
                  }
                }

                const isElementRoot = (vnode: VNode) => {
                  return (
                    vnode.shapeFlag & (ShapeFlags.COMPONENT | ShapeFlags.ELEMENT) ||
                    vnode.type === Comment // potential v-if branch switch
                  )
                }
                // inherit directives
                if (vnode.dirs) {
                  if (__DEV__ && !isElementRoot(root)) {
                    warn(
                      `Runtime directive used on component with non-element root node. ` +
                        `The directives will not function as intended.`,
                    )
                  }
                  // 注意种类的 vnode 是组件的都 vnode,
                  // 每次组件创建新的 subTree 需要将组件的指令设置到 subTree 中
                  // 这里之所以克隆,是因为某些 vnode 可能是被静态提升的, 所以需要克隆, 以免直接修改
                  // 会将静态节点也给修改了
                  // render() => cache[3] || cache[3] = createVNode('div', {....})
                  // 所以并不是每次调用 render 函数创建返回的 vnode 就是新的 vnode, 有可能是静态提升缓存的 vnode
                  // 并不是新的 vnode, 而是之前的缓存的 vnode, 所以这里需要克隆一个新的 vnode, 以避免直接缓存的
                  // vnode, 因为这里缓存的 vnode 可能还在其他的组件中展示, 而当前的组件需要一个新的 vnode,
                  // 其他的组件依然需要之前缓存的 vnode, 故当前组件不能修改缓存的组件,只能克隆一个新的vnode
                  // 给当前组件显式
                  // clone before mutating since the root may be a hoisted vnode
                  root = cloneVNode(root, null, false, true)
                  // 来自组件的指令要放到组件中的 subTree 中元素节点中去, 组件的指令只有当组件的 subTree 是单个
                  // 元素节点时,才会有效, 组件的 subTree 若是多个节点, 那么设置在组件上面的是无效的
                  // 指令主要是针对 dom 元素的, 注意这里的 vnode 是组件的 vnode, 不是这里的 subTree 的 vnode
                  // root 才是这里的组件的 subTree, 这里是要将组件 vnode.dirs 指令放入到 subTree 的 dirs 中
                  // 因为组件的指令最终要应用到 元素 vnode 中
                  root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs
                }
                // inherit transition data
                if (vnode.transition) {
                  if (__DEV__ && !isElementRoot(root)) {
                    warn(
                      `Component inside <Transition> renders non-element root node ` +
                        `that cannot be animated.`,
                    )
                  }
                  setTransitionHooks(root, vnode.transition)
                }

                result = root

                setCurrentRenderingInstance(prev);
                return result
              }
              patch(null, subTree, container, anchor, instance /* parentComponent */) => {
                // 深度优先 -> 继续深度 patch 子组件 vnode
                // 可以得知
                // onBeforeMount -> onBeforeMount -> onBeforeMount
                // onMounted     <- onMounted     <- onMounted
                // 先创建父组件然后创建子组件... 最后一个子组件创建之后, 开始从最后一个子组件开始执行 onMounted
                // onBeforeMount 由外往里进行捕获执行
                // onMounted     由里往外进行冒泡执行
                // 这里与 dom 事件处理机制类似:
                // dom 事件传播机制:
                // - 捕获阶段(Capture Phase):
                //   当一个事件发生时，它首先从最外层的元素开始，然后逐级向下传递到具体的事件目标元素。
                //   在这个阶段，事件会依次经过每个父元素，直到到达实际触发事件的目标元素。
                // - 目标阶段(Target Phase):
                //   这是事件到达具体触发它的那个DOM元素时所处的阶段。在这个阶段，事件会被传递给事件的实际目标，
                //   并触发绑定在其上的所有事件处理函数。
                // - 冒泡阶段(Bubble Phase): (浏览器事件监听器默认为: 冒泡阶段进行处理的)
                //   在事件被目标元素处理之后，它会开始从目标元素向上逐级传播至其祖先元素，直到文档的根节点。
                //   这是大多数开发者熟悉的默认行为。
                bm && invokeArrayFns(bm)
                patch(null, subTree, container, anchor, instance => {
                  bm && invokeArrayFns(bm)
                  patch(null, subTree, container, anchor, instance) => {
                    bm && invokeArrayFns(bm)
                  }
                  m && queuePostFlushCb(m)
                }
                m && queuePostFlushCb(m)
              }
              instance.subTree = subTree
              // 注意这里是 patch() 执行结束后, 才会设置 el 到 subTree.el
              initialVNode.el = subTree.el
              // mounted hook - 这里是异步执行, 同时是在异步执行队列(queue) 执行完后再执行
              m && queuePostFlushCb(m)
              instance.isMounted = true
            } else {
              // 更新
              let { next, bu, u, parent, vnode } = instance;
              // updateComponent
              // This is triggered by mutation of component's own state (next: null)
              // OR parent calling processComponent (next: VNode)
              let originNext = next;
              // Disallow component effect recursion during pre-lifecycle hooks.
              // toggleRecurse(instance, false);
              // 注意在执行更新函数时, 设置了
              // effect.flags &= ~EffectFlags.ALLOW_RECURSE
              // job.flags! &= ~SchedulerJobFlags.ALLOW_RECURSE
              toggleRecurse({ effect, job }, allowed)(instance, false){
                if (allowed) {
                  effect.flags |= EffectFlags.ALLOW_RECURSE
                  job.flags! |= SchedulerJobFlags.ALLOW_RECURSE
                } else {
                  effect.flags &= ~EffectFlags.ALLOW_RECURSE
                  job.flags! &= ~SchedulerJobFlags.ALLOW_RECURSE
                }
              }
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
                          // 来自父组件的 job, 里面调用子组件执行 instance.update()
                          // 触发属性的 set -> dep.trigger
                          if (shouldUpdateComponent(prevTree, nextTree)) {
                            // 这里的 instance.update() 是子组件的 update()
                            child.update() { // - 此时正在执行的就是 childUpdateJob
                              effect.run(){
                                effect.flags |= EffectFlags.RUNNING
                                componentUpdateFn() {
                                  // 此时这里的 updateProps 触发的 set 会被提前返回, 不会执行 queueJob()
                                  updateProps() {
                                    props.x = y ->
                                    // 注意此时的 toggleRecurse(instance, false) 上面已经执行
                                    // 关键是这里的 toggleRecurse(instance, false)
                                    // 设置了此时不可以进行 ALLOW_RECURSE,
                                    // 避免了在 sub 在运行时, 又触发 set 导致重复添加
                                    // toggleRecurse(instance, false) 函数中设置了: flags
                                    // instance.effect.flags &= ~EffectFlags.ALLOW_RECURSE
                                    // instance.job.flags! &= ~SchedulerJobFlags.ALLOW_RECURSE
                                    // 同时 child.update() 正在执行,那么此时

                                    instance.effect.flags |= EffectFlags.RUNNING
                                    dep.trigger() {
                                      dep.version++
                                      dep.notify() {
                                        startBatch() {  batchDepth++ }
                                        for (let link = this.subs; link; link = link.prevSub) {
                                          sub.notify() {
                                            // 同时设置属性时, effect 正在 RUNNING
                                            if(sub.flags & EffectFlags.RUNNING) {
                                              // 不允许递归调用则直接返回, 默认为不允许递归
                                              // - 故这里设置属性触发的
                                              // dep.trigger -> dep.notify 直接返回
                                              if(!(sub.flags & EffectFlags.ALLOW_RECURSE)) {
                                                return
                                              }
                                              // NOTE: 这里是关键(必须同时满足 RUNNING,!ALLOW_RECURSE):
                                              // childUpdateJob 同时 满足 RUNNING && !ALLOW_RECURSE
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
                                  updateSlots(){}
                                  toggleRecurse(instance, true)
                                  const nextTree = renderComponentRoot(instance)
                                  const prevTree = instance.subTree
                                  patch(prevTree, nextTree) {
                                    if (shouldUpdateComponent(prevTree, nextTree)) {
                                      // ...
                                    }
                                  }
                                }
                                effect.flags &= ~EffectFlags.RUNNING
                              }
                            }
                            // 当 instance.update() 执行完后,所有的 dep.version 与 link.version 都同步了
                            // 后面再次执行组组建对应的 job 时:
                            // 这里需要区分: job, update 的定义
                            // job = effect.runIfDirty.bind(effect)
                            // update = effect.run.bind(effect)
                            // 发现父组件在调用 instance.update() 时, 会执行 effect.run(), 无需脏检查
                            // 而在队列中 job 函数执行时, 执行的却是 effect.runIfDirty(), 也就是每个 job
                            // 执行时, 需要先执行脏检查, 然后再执行 effect.run(),
                            // 这样当父组件执行 instance.update()时, 会将
                            // dep.version 与 link.version 都同步, 后面的子组件的 job 执行时,
                            // 会发现此时的 sub 已经不脏了, 就会跳过此处的 job 执行, 不会执行 effect.run
                            // 这就是 父组件调用子组件的更新函数, 后面子组件的 job 执行时, 不会再次执行
                            // effect.run, 这样就解决了子组件的重复更新问题
                          }
                        }
                      }
                    }
                  };
                  // 关于 vue 中 slots 与 children 的区别?
                  // 1. children 存在于 vnode 中, 而 slots 存在于 component 中
                  // 2. children 可以是多种类型(string,null,array,vnode,object)
                  //    slots 是通过对 vnode.children 各种类型进行统一转换为对象
                  //    slots 是组件 vnode 在创建组件时通过对 vnode.children 进行统一处理之后的 vnode
                  //    slots 只是组件中概念, 而 children 可以任意的 vnode (元素vnode,文本vnode,...)
                  //    slots 只是组件vnode中的 children 的统一处理 { slotName: slotFn }
                  // 旧的 slots, 与新的 slots
                  // vue 组件的 slots 最终都是要作为组件的 subTree 的一部分, 所以在创建组件的
                  // subTree = renderComponentRoot(instance){
                  //   // 这里们需要将组件的 slots 进行创建为 vnode, 从而作为组件的 subTree 的一部分
                  // }
                  // slots 最终是组件 subTree 的一部分
                  updateSlots(instance, nextVNode.children, optimized) {
                    const children = nextVNode.children
                    // 这里的 slots 已经在组件 mount 中在 initSlots()
                    // 已经将 instance.vnode.children 转换为 instance.slots
                    // NOTE:
                    // 在 mounted 中处理的 slots 是老的 vnode 中 children 转换而来的
                    // 而这里的 children 时新创建的 vnode 的 children,
                    // 这里新创建的 vnode.children 可能已经变化了,故需要重新进行转换(normlization)到新的 slots
                    const { vnode, slots } = instance
                    // 这里的 instance.slots 是老的 vnode 在 mounted 时已经处理的 slots
                    // 而这里的 children 则是新创建的 nextVNode 中 children, 这里新传入的 children 也需要
                    // 像老的 vnode 中 children 被处理(normalization), 才能转为组件的 slots
                    // 老的 slots 已经进行 normalization
                    // 新的 slots 需要重新 normalization
                    // 这里的更新就是用新的 slots 覆写旧的 slots, 移除老的 slot
                    // 即: Object.assign(instance.slots, children)
                    // 最终得到 更新后的 instance.slots, 在下面的 renderComponentRoot() 函数中通过调用
                    // const Foo = {
                    //   template = `<div>
                    //     <slot name="foo"/>
                    //     <slot name="bar"/>
                    //     <slot name="default"/>
                    //   <div>`
                    // }
                    // const Bar = {
                    //   template = `
                    //   <Foo>
                    //     <slot name="bar"/>
                    //     <template v-slot:foo></template>
                    //     <template v-slot:default></template>
                    //   <Foo>`
                    // }
                    // const Car = `<Bar> <template v-slot:bar>bar</template> <Bar/>`
                    // instances.render() {
                    //   return h(Foo, null, {
                    //     // 直接传递给组件 Foo 的 slot
                    //     foo: _withCtx(() => [ _createTextVNode(_toDisplayString(_ctx.name), 1)]),
                    //     default: _withCtx(() => _cache[0] || (_cache[0] = [_createTextVNode('')])),
                    //     // Foo 组件中的 <slot name="bar"/> 称为 forward slot
                    //     bar: _withCtx(() => [_renderSlot(_ctx.$slots, 'bar')]),
                    //   })
                    // }
                    // 通过子组件的 renderSlot() 进行消费
                    let needDeletionCheck = true
                    let deletionComparisonTarget = EMPTY_OBJ
                    // children 为对象
                    if (vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
                      // 新的 children 需要重新进行 normalization
                      const type = (children as RawSlots)._
                      if(type) {
                        // _ 标识 表明是来自组件模板编译的 slots, 已经进行了 normalization
                        assignSlots(slots, children as Slots, optimized)
                      } else {
                        // 否则 children 需要进行 normalazation 转换到 slots
                        needDeletionCheck = !(children as RawSlots).$stable
                        normalizeObjectSlots(children as RawSlots, slots, instance)
                      }
                      // 这里的 children 时对象哦, 因为是在 ShapeFlags.SLOTS_CHILDREN 判断里面
                      deletionComparisonTarget = children as RawSlots
                    } else if (children) {
                      // 新的 children 需要重新进行 normalization
                      // non slot object children (direct value) passed to a component
                      normalizeVNodeSlots(instance, children) {
                        const normalized = normalizeSlotValue(children)
                        instance.slots.default = () => normalized
                      }
                      deletionComparisonTarget = { default: 1 }
                    }
                    // delete stale slots
                    if (needDeletionCheck) {
                      for (const key in slots) {
                        // 旧的 slotName 不在新的 slots 中, 需要从旧的 slots 中移除
                        if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
                          delete slots[key]
                        }
                      }
                    }
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
                    // 在执行组件 beforeUpdate hook 前, 先执行队列中的 watcher Job,
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
                // 父组件的更新会包含子组件的更新, 所以优先执行父组件的更新,
                // 而子组件的更新 job 直接废弃掉(如何废弃?).
                // 来自组件内部状态的更新, 复用组件自己的 instance.vnode 即可, 无需再次创建
                // 因为父组件没有更新, 也就是没有创建新的 subTree, 故当前组件的 vnode 就是之前父组件创建的 vnode
                // NOTE: 子组件的 vnode 都是通过父组件创建的
                next = vnode
              };
              // 注意以上的 watch 更新会在 这里的 beforeUpdate hook 前面执行
              // beforeUpdate hook 这里是同步执行
              bu && invokeArrayFns(bu)
              // [parentJob]
              //  |
              //  flushingIndex
              toggleRecurse(instance, true)
              // 在 nextTree 的创建过程中, 若是有父组件传入的 slots,
              // 那么在此过程中就会将父组件中的 slots 创建出(执行对应的 slots.xxx 函数)
              // 对应的 vnode, 作为 subTree 的一部分 vnode 节点, 也就是最终 slots 也是作为 subTree 的一部分
              // 进行 patch(prevTree, nextTree) 从而进行更新的
              const nextTree = renderComponentRoot(instance) => {
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
                      // render(_ctx, _cache, $props, $setup, $data, $options) {
                      render.call(thisProxy, proxy, renderCache, props, setupState, data, ctx) => {
                        const _ctx = proxy;
                        const _cache = renderCache;
                        const $props = props;
                        const $setup = setupState;
                        const $data = data;
                        const $options = ctx // { _: instance }

                        // 用户手写的渲染函数,或者模板编译后的函数
                        // <template>
                        //   <h1>title</h1>
                        //   <Foo ref="foo">
                        //     <template #foo>{{ name }}</template>
                        //     <template #default>default</template>
                        //     <!-- <slot /> 标签作为组件的 children 称为 forward slot 转发/代理 slot -->
                        //     <template #bar><slot name="bar" /></template>
                        //     <template #car><slot name="car" prop="car">car</slot></template>
                        //   </Foo>
                        //   <slot />
                        //   <slot name="a" prop="a" />
                        //   <slot name="b" prop="b">b</slot>
                        // </template>
                        return (
                          _openBlock(),
                          _createElementBlock(
                            _Fragment,
                            null,
                            [
                              // prettier-ignore
                              _cache[1] || (_cache[1] = _createElementVNode("h1", null, "title", -1 /* HOISTED */)),
                              _createVNode(
                                _component_Foo,
                                { ref: 'foo' },
                                {
                                  // 注意 _withCtx 返回的是函数, 还不会立即执行(需要在子组件创建/更新时执行)
                                  // prettier-ignore
                                  foo: _withCtx(() => [ _createTextVNode(_toDisplayString(_ctx.name), 1 /* TEXT */)]),
                                  // prettier-ignore
                                  default: _withCtx(() => _cache[0] || (_cache[0] = [_createTextVNode('default')])),
                                  // 渲染来自父组件传入的 slots.bar 直接进一步传入到 Foo 组件中
                                  bar: _withCtx(() => [_renderSlot(_ctx.$slots, 'bar')]),
                                  // 或者用户手写 render 函数处理转发 slot, 注意此时不会在当前组件中,这里返回的函数, 不会立即执行
                                  // 而是在 Foo 组件的创建/更新时执行这里的函数, 从而再去执行 $slots.boo() 创建对应的 vnode
                                  // 作为 Foo 组件的 subTree 的一部分参与 patch
                                  boo: () => _ctx.$slots.boo && _ctx.$slots.boo() || h('div', 'fallback')
                                  // forward slot with props and default content
                                  car: _withCtx(() => [
                                    _renderSlot(_ctx.$slots, 'car', { prop: 'car' }, () => [
                                      _cache[1] || (_cache[1] = _createTextVNode('car')),
                                    ]),
                                  ]),
                                  _: 3 /* FORWARDED */,
                                },
                                512 /* NEED_PATCH */,
                              ),
                              // NOTE: renderSlot 只是编译模板中的辅助函数, 并没有暴露给手写的
                              // render 函数, 用户自己手写的 render 函数, 需要用户自己处理父组件传入的 slots
                              // 比如用户自己执行 slots.bar(), slots.default(), ...
                              // 这里没有 _withCtx 包裹, 立即执行对应的 slot 函数
                              // 渲染来自父组件传入的 slots:
                              // { a:fn, b: fn, default: fn, bar: fn, car: fn }
                              _renderSlot(_ctx.$slots, 'default'),// 返回的是一个 Fragment
                              _renderSlot(_ctx.$slots, 'a', { prop: 'a' }), // 返回的是一个 Fragment
                              // runtime-core/src/helpers/renderSlot.ts
                              _renderSlot(
                                /* slots */   _ctx.$slots,
                                /* name */    'b',
                                /* props */   { prop: 'b' } ,
                                /* fallback */() => [ _cache[1] || (_cache[1] = _createTextVNode('b'))]
                              ) {
                                let slot = slots[name];
                                // a compiled slot disables block tracking by default to avoid manual
                                // invocation interfering with template-based block tracking, but in
                                // `renderSlot` we can be sure that it's template-based so we can force
                                // enable it.
                                // 在 _renderSlot 函数中, 因为只能是来自模板编译的执行,所以这里一定是来自模板编译的
                                // render, 而不是用户手写的 render, 故可以开启优化
                                if (slot && (slot as ContextualRenderFn)._c) {
                                  ;(slot as ContextualRenderFn)._d = false
                                }
                                openBlock();
                                // 这里执行 slots.bar(props), slots.bar(props) 函数
                                // validSlotContent = slot(props) || null
                                const validSlotContent = slot && ensureValidVNode(slot(props));
                                const rendered = createBlock(
                                  Fragment,
                                  { key: slotKey},/* props */
                                  validSlotContent || (fallback ? fallback() : []), /* children */
                                  PatchFlags.BAIL /* patchFlag */
                                );
                                if (slot && (slot as ContextualRenderFn)._c) {
                                  ;(slot as ContextualRenderFn)._d = true
                                }
                                // 最终模板编译渲染出来的 <slot /> 就是一个 Fragment
                                return rendered
                              },

                              // 用户手写 render 函数处理 <slot name="b" prop="b">b</slot> 插槽
                              // 最终是调用函数,创建vnode,似乎所有的最后都是创建vnode -> patch(vnode) -> dom
                              _ctx.$slots.b && _ctx.$slots.b({ prop: 'a' }) || h('div', 'fallback')
                            ],
                            64 /* STABLE_FRAGMENT */,
                          )
                        )
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
              const prevTree = instance.subTree
              patch(prevTree, nextTree, container, anchor, instance /* parentComponent */) => {
                // 更新也是深度优先
                // onBeforeUpdate -> onBeforeUpdate -> onBeforeUpdate
                // onUpdated      <- onUpdated      <- onUpdated
                bu && invokeArrayFns(bu)
                patch(null, subTree, container, anchor, instance => {
                  bu && invokeArrayFns(bu)
                  patch(null, subTree, container, anchor, instance) => {
                    bu && invokeArrayFns(bu)
                  }
                  u && queuePostFlushCb(u)
                }
                u && queuePostFlushCb(u)
              }
              instance.subTree = nextTree
              next.el = nextTree.el
              // updated hook 异步执行
              u && queuePostFlushCb(u)
            }
          };

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
          };

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
          const update = (instance.update = effect.run.bind(effect));

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
          // NOTE: 这里设置了组件的 job 可以递归插入到队列中执行

          // effect.run() 这里直接调用 run, 而不是 job, 无需脏检查
          // 后面更新时, 每次都是执行 job, 里面在执行 run 之前, 会进行脏检查
          // instance.update()
          update()
        }
      };

      // patch 结束前 把自己(el or instance) 注册/设置 到父组件的 refs 中
      // ref 必须要有 parentComponent 因为 ref 获取的是子树中的引用
      // set ref
      if (ref != null && parentComponent) {
        // !n2 为 false
        // setRef 还需要在 unmount 中调用, 最后一个参数为 true 表示在 unmount 中调用
        setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2)
      }
    }
  }

  isMounted = true
  app._container = rootContainer
  return getComponentPublicInstance(vnode.component!)
}
```
