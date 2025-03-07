```js
app = createApp({
  // 一个元素上可以有多个指令
  // 参数 :[arg] 可以是动态的, .[mod]不可以是动态的
  // 修饰符可以是多个,但是参数只能是一个
  // 指令名称也可以是动态的??? - 指令名称不可以是动态的
  // v-[dir]:[arg].mod="val"
  // '['.charCodeAt(0) -> 91
  // ']'.charCodeAt(0) -> 93
  // '('.charCodeAt(0) -> 40
  // ')'.charCodeAt(0) -> 41
  // '[中文]' -> 91200132599193
  // [ 的 Unicode 码点是 U+005B，对应的十进制是 91。
  // 中 的 Unicode 码点是 U+4E2D，对应的十进制是 20013。
  // 文 的 Unicode 码点是 U+6587，对应的十进制是 25991。
  // ] 的 Unicode 码点是 U+005D，对应的十进制是 93
  template: /* html */ `
    <p v-pin.mod1.mod2:arg1:arg2="val"></p>
    <p v-pin v-foo></p>
    <p v-pin.mod v-foo:arg></p>
    <p v-pin:arg></p>
    <p v-pin="val"></p>
    <p v-pin:arg="val"></p>
    <p v-pin:[arg].mod="val"></p>
    <p v-pin:arg.[mod]="val"></p>
    <p v-pin:arg1:arg2.mod1.mod2="val"></p>
    <p v-[dir]:[arg].mod="val" v-foo></p>
    <p v-(dir):[arg].mod="val" v-foo></p>
    <p v-[中文]:[arg].mod="val" v-foo></p>
    <Bar v-pin v-foo></Bar>
  `,
  render(_ctx, _cache, $props, $setup, $data, $options) {
    const _directive_pin = _resolveDirective('pin')
    const _directive_foo = _resolveDirective('foo')
    const _directive_91dir93 = _resolveDirective('[dir]')
    const _directive_40dir41 = _resolveDirective('(dir)')
    const _directive_91200132599193 = _resolveDirective('[中文]')

    return (
      _openBlock(),
      _createElementBlock(
        _Fragment,
        null,
        [
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [
              [
                _directive_pin,
                _ctx.val,
                void 0,
                {
                  mod1: true,
                  'mod2:arg1:arg2': true,
                },
              ],
            ],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [[_directive_pin], [_directive_foo]],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [
              [_directive_pin, void 0, void 0, { mod: true }],
              [_directive_foo, void 0, 'arg'],
            ],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [[_directive_pin, void 0, 'arg']],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [[_directive_pin, _ctx.val]],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [[_directive_pin, _ctx.val, 'arg']],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [[_directive_pin, _ctx.val, _ctx.arg, { mod: true }]],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [[_directive_pin, _ctx.val, 'arg', { '[mod]': true }]],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [
              [
                _directive_pin,
                _ctx.val,
                'arg1:arg2',
                {
                  mod1: true,
                  mod2: true,
                },
              ],
            ],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [
              [_directive_91dir93, _ctx.val, _ctx.arg, { mod: true }],
              [_directive_foo],
            ],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [
              [_directive_40dir41, _ctx.val, _ctx.arg, { mod: true }],
              [_directive_foo],
            ],
          ),
          _withDirectives(
            _createElementVNode('p', null, null, 512 /* NEED_PATCH */),
            [
              [_directive_91200132599193, _ctx.val, _ctx.arg, { mod: true }],
              [_directive_foo],
            ],
          ),
          _withDirectives(
            _createVNode(_component_Bar, null, null, 512 /* NEED_PATCH */),
            [[_directive_pin], [_directive_foo]],
          ),
        ],
        64 /* STABLE_FRAGMENT */,
      )
    )
  },
})

// 由于指令是基于 vue 模板进行使用的, 那么在手写 render 函数 或者 vue jsx 中如何使用指令呢?
// 答案是不使用指令, 而是可以使用 vnode hooks
// 比如:
render() {
  return h('div', {
    // vnode hooks 可以替换指令
    onVnodeBeforeMount(vnode){},
    onVnodeMounted(vnode){},
    onVnodeBeforeUnmount(vnode){},
    onVnodeUnmounted(vnode){}
    onVnodeBeforeUpdate(vnode, oldVNode){},
    onVnodeUpdated(vnode, oldVNode){},
  })
}

// <p v-pin:[arg].mod="value"></p>
// 直接在模板中使用 `v-` 前缀加上这里定义的指令名称 `pin`: v-pin
// 注意指令的 hooks
// 是在 mountElement, patchElement 中调用的, 指令专门是针对元素的
// 不是在组件的 mountComponent, updateComponent 中调用的, 组件只负责将指令传入到里面具体的单个节点的子元素上面
// 最终指令的调用处理都是通过 元素 vnode 中的创建/更新触发的, 所以是在元素相关的 mountElement, patchElement

// 对象形式指令
app.directive('pin', {
  // binding = { dir, instance, value, oldValue, arg, modifiers }
  mounted(el, binding, vnode, prevVNode) {
    const { dir, instance, value, oldValue, arg, modifiers } = binding
  },
  updated(el, binding, vnode, prevVNode) {
    const { dir, instance, value, oldValue, arg, modifiers } = binding
  },
  created() {},
  beforeMount(){},
  beforeUpdate(){},
  unmounted(){},
})

// 函数形式指令
app.directive('pin', function fn(el, binding, vnode, prevVNode) => {
  // 在 mounted, updated 都会执行这个函数
  const { dir, instance, value, oldValue, arg, modifiers } = binding
})

// 内部会转成对象形式 等价于 =>
app.directive('pin', {
  // mounted, updated 都对应同一个函数, 在 mounted, updated 都会执行这个函数
  mounted: fn,
  updated: fn,
})

// 在元素创建/更新/卸载中执行对应的指令的 hooks
mountElement(vnode, container,anchor, parentComponent){
  let el: RendererElement
  let vnodeHook: VNodeHook | undefined | null
  const { props, shapeFlag, transition, dirs } = vnode
  el = vnode.el = hostCreateElement(vnode.type, namespace, props && props.is, props)
  // 这里先创建后子元素后, 再处理元素的属性
  // mount children first, since some props may rely on child content
  // being already rendered, e.g. `<select value>`
  if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
    hostSetElementText(el, vnode.children as string)
  } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
    mountChildren(
      vnode.children as VNodeArrayChildren,
      el,
      null,
      parentComponent,
      parentSuspense,
      resolveChildrenNamespace(vnode, namespace),
      slotScopeIds,
      optimized,
    )
  }

  // 处理元素 vnode 的指令 vnode.dirs
  if (dirs) {
    invokeDirectiveHook(vnode, null, parentComponent, 'created')
  }
}
```
