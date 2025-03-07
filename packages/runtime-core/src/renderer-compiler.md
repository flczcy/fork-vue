## `dynamicProps` and `@click="fn()"` and NEED_HYDRATION

```html
<p v-on:click="fn" :onclick="d" />
```

```js
import {
  openBlock as _openBlock,
  createElementBlock as _createElementBlock,
} from 'vue'
// prettier-ignore
export function render(_ctx, _cache, $props, $setup, $data, $options) {
  return (_openBlock(), _createElementBlock("p", {
    onClick: _ctx.fn, // vue 事件 则是 onClick 是首字符大写
    onclick: _ctx.d,  // 原生事件 则是 on + 事件名称 不是首字符大写
    // 以 on 开头的属性 都会被认为是事件, 不会被认为是属性, 会被排除在属性的比较中
  }, null, 8 /* PROPS */, ["onClick", "onclick"]))
}
```

> @click="fn()" 则是会被编译成一个包装函数: $event => (_ctx.fn())
> 事件名称会加上 on+首字母大写的事件名称, 比如 `onClick`
> 有横线的事件名称会被转成 camelCase: v-on:do-foo 会被解析为 `onDoFoo`
> 若是有 once 修饰符则会被加在事件名称最后面, 比如 `onClickOnce`
> v-on:do-foo.once -> onDoFooOnce
> v-on:do-foo.once.once -> onDoFooOnceOnce
> v-on:do-foo.once.once.once -> onDoFooOnceOnceOnce ...
> 无效的修饰符 则会被忽略
> v-on:do-foo.mod -> onDoFoo
> 无效的修饰符 mod 则会被忽略
> v-on:do-foo.mod.stop.once="foo-bar()" ->
> `onDoFooOnce: _withModifiers($event => (\_ctx.foo-\_ctx.bar()), ["stop"])`

```js
const app = createApp({
  template: /* html */ `
    <div>
      <p :a="b" b="2">
      <p v-on:do="fn" :a="b" b="2" />
      <p v-on:do="f-b" :a="b" b="2" />
      <p v-on:do="fn()" :a="b" :b="2" c="d" />
      <A v-on:do="fn" :a="b" b="2" />
      <A v-on:do="fn()" :a="b" :b="2" c="d" />
      <p v-on:do="foo-bar" :a="b" b="2" />
      <p v-on:do="foo-bar()" :a="b" b="2" />
      <p v-on:do-foo="foo-bar()" :a="b" b="2" />
      <p v-on:do-foo.once="foo-bar()" :a="b" b="2" />
      <p v-on:do-foo.mod.stop.once="foo-bar()" :a="b" b="2" />
    </div>
  `,
 render (_ctx, _cache) => {
  // prettier-ignore
  return (_openBlock(), _createElementBlock("div", null, [
      _createElementVNode("p", {
        a: _ctx.b,
        b: "2"
      }, null, 8 /* PROPS */, ["a"]),
      _createElementVNode("p", {
        onDo: _ctx.fn, // 只要元素上面有绑定事件, 那么就会有 NEED_HYDRATION 标识
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]/* dynamicProps */),
      _createElementVNode("p", {
        onDo: $event => (_ctx.fn()),
        a: _ctx.b,
        b: 2,
        c: "d"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]/* dynamicProps */),
      _createVNode(_component_A, {
        onDo: _ctx.fn, // 组件上的事件不会有 NEED_HYDRATION 标识
        a: _ctx.b,
        b: "2"
      }, null, 8 /* PROPS */, ["onDo", "a"]/* dynamicProps */),
      _createVNode(_component_A, {
        onDo: $event => (_ctx.fn()),
        a: _ctx.b,
        b: 2,
        c: "d"
      }, null, 8 /* PROPS */, ["onDo", "a"]/* dynamicProps */),
      _createElementVNode("p", {
        onDo: $event => (_ctx.foo-_ctx.bar),
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]),
      _createElementVNode("p", {
        onDo: $event => (_ctx.foo-_ctx.bar()),
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]),
      _createElementVNode("p", {
        // @do-foo -> onDoFoo
        onDoFoo: $event => (_ctx.foo-_ctx.bar()),
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDoFoo", "a"]),
      _createElementVNode("p", {
        // @do-foo.once -> onDoFooOnce
        onDoFooOnce: $event => (_ctx.foo-_ctx.bar()),
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDoFooOnce", "a"]),
      _createElementVNode("p", {
        onDoFooOnce: _withModifiers($event => (_ctx.foo-_ctx.bar()), ["stop"]),
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDoFoo", "a"])
    ]))
  }
})
```

## BLOCK TREE and STABLE_FRAGMENT

> 即使有 v-if, 也是 STABLE_FRAGMENT, 因为在 v-if 为 false 是, 取代的是一个 comment 节点,
> 总的 FRAGMENT 中节点数量是不会变的, 所以是 STABLE_FRAGMENT
> 即使有 v-for, 也是 STABLE_FRAGMENT, 因为这里整体的将 v-for 看做是一个整体的一个 vnode 节点
> 总的 FRAGMENT 中节点数量是不会变的, 所以是 STABLE_FRAGMENT

```html
<p v-if="a in list" :a="b" b="2" />
<p v-for="it of items" v-on:do="fn" :a="b" b="2" />
<p v-on:do="fn()" :a="b" :b="2" c="d" />
```

```js
import {
  createElementVNode as _createElementVNode,
  Fragment as _Fragment,
  openBlock as _openBlock,
  createElementBlock as _createElementBlock,
} from 'vue'

export function render(_ctx, _cache, $props, $setup, $data, $options) {
  // prettier-ignore
  return (_openBlock(), _createElementBlock(_Fragment, null, [
    (_ctx.a in _ctx.list)
      // 这里的 v-if 现在是作为一个 block 用来收集其内部的动态节点, 而其本身又是一个动态节点
      ? (_openBlock(), _createElementBlock("p", {
          key: 0,
          a: _ctx.b,
          b: "2"
        }, null, 8 /* PROPS */, ["a"]))
      : _createCommentVNode("v-if", true),
    // 这里的 v-for 现在是作为一个 block 用来收集其内部的动态节点, 而其本身又是一个动态节点
    (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.items, (it) => {
      return (_openBlock(), _createElementBlock("p", {
        onDo: _ctx.fn,
        a: _ctx.b,
        b: "2"
      }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]))
    }), 256 /* UNKEYED_FRAGMENT */)),
    _createElementVNode("p", {
      onDo: $event => (_ctx.fn()),
      a: _ctx.b,
      b: 2,
      c: "d"
    }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"])
  ], 64 /* STABLE_FRAGMENT */))
}
```

```html
<div>
  <p :a="b" b="2" />
  <p v-on:do="fn" :a="b" b="2" />
  <p v-on:do="fn()" :a="b" :b="2" c="d" />
  <a v-on:do="fn" :a="b" b="2">
    <b v-for="li of lists" />
    <b v-for="li of lists" :key="li" />
    <b v-if="s" />
  </a>
  <a v-on:do="fn()" :a="b" :b="2" c="d">
    <b>{{b}}</b>
  </a>
</div>
```

## STABLE_SLOTS

```js
const render = (_ctx, _cache) => {
  const _component_B = _resolveComponent('B')
  const _component_A = _resolveComponent('A')
  // prettier-ignore
  return (_openBlock(), _createElementBlock("div", null, [
    _createElementVNode("p", {
      a: _ctx.b,
      b: "2"
    }, null, 8 /* PROPS */, ["a"]),
    _createElementVNode("p", {
      onDo: _ctx.fn,
      a: _ctx.b,
      b: "2"
    }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]),
    _createElementVNode("p", {
      onDo: $event => (_ctx.fn()),
      a: _ctx.b,
      b: 2,
      c: "d"
    }, null, 40 /* PROPS, NEED_HYDRATION */, ["onDo", "a"]),
    _createVNode(_component_A, {
      onDo: _ctx.fn,
      a: _ctx.b,
      b: "2"
    }, {
      // _withCtx: packages/runtime-core/src/componentRenderContext.ts
      default: _withCtx(() => [
        // disableTracking = false
        (_openBlock(true/* disableTracking */), _createElementBlock(_Fragment, null, _renderList(_ctx.lists, (li) => {
          return (_openBlock(), _createBlock(_component_B))
        }), 256 /* UNKEYED_FRAGMENT */)),
        (_openBlock(true/* disableTracking */), _createElementBlock(_Fragment, null, _renderList(_ctx.lists, (li) => {
          return (_openBlock(), _createBlock(_component_B, { key: li }))
        }), 128 /* KEYED_FRAGMENT */)),
        (_ctx.s)
          ? (_openBlock(), _createBlock(_component_B, { key: 0 }))
          : _createCommentVNode("v-if", true)
      ], undefined /* ctx: currentRenderingInstance */, true /* isNonScopedSlot: __COMPAT__ only */),
      _: 1 /* STABLE */
    }, 8 /* PROPS */, ["onDo", "a"]),
    _createVNode(_component_A, {
      onDo: $event => (_ctx.fn()),
      a: _ctx.b,
      b: 2,
      c: "d"
    }, {
      default: _withCtx(() => [
        _createVNode(_component_B, null, {
          default: _withCtx(() => [
            _createTextVNode(_toDisplayString(_ctx.b), 1 /* TEXT */)
          ], undefined /* ctx: currentRenderingInstance */, true /* isNonScopedSlot: __COMPAT__ only */),
          _: 1 /* STABLE */
        })
      ], undefined, true),
      _: 1 /* STABLE */
    }, 8 /* PROPS */, ["onDo", "a"])
  ]))
}
```
