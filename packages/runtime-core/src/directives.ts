/**
Runtime helper for applying directives to a vnode. Example usage:

const comp = resolveComponent('comp')
const foo = resolveDirective('foo')
const bar = resolveDirective('bar')

return withDirectives(h(comp), [
  [foo, this.x],
  [bar, this.y]
])
*/

import type { VNode } from './vnode'
import { EMPTY_OBJ, isBuiltInDirective, isFunction } from '@vue/shared'
import { warn } from './warning'
import {
  type ComponentInternalInstance,
  type Data,
  getComponentPublicInstance,
} from './component'
import { currentRenderingInstance } from './componentRenderContext'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { mapCompatDirectiveHook } from './compat/customDirective'
import { pauseTracking, resetTracking, traverse } from '@vue/reactivity'

export interface DirectiveBinding<
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> {
  instance: ComponentPublicInstance | Record<string, any> | null
  value: Value
  oldValue: Value | null
  arg?: Arg
  modifiers: DirectiveModifiers<Modifiers>
  dir: ObjectDirective<any, Value>
}

export type DirectiveHook<
  HostElement = any,
  Prev = VNode<any, HostElement> | null,
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> = (
  el: HostElement,
  binding: DirectiveBinding<Value, Modifiers, Arg>,
  vnode: VNode<any, HostElement>,
  prevVNode: Prev,
) => void

export type SSRDirectiveHook<
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> = (
  binding: DirectiveBinding<Value, Modifiers, Arg>,
  vnode: VNode,
) => Data | undefined

export interface ObjectDirective<
  HostElement = any,
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> {
  /**
   * @internal without this, ts-expect-error in directives.test-d.ts somehow
   * fails when running tsc, but passes in IDE and when testing against built
   * dts. Could be a TS bug.
   */
  __mod?: Modifiers
  created?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  beforeMount?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  mounted?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  beforeUpdate?: DirectiveHook<
    HostElement,
    VNode<any, HostElement>,
    Value,
    Modifiers,
    Arg
  >
  updated?: DirectiveHook<
    HostElement,
    VNode<any, HostElement>,
    Value,
    Modifiers,
    Arg
  >
  beforeUnmount?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  unmounted?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  getSSRProps?: SSRDirectiveHook<Value, Modifiers, Arg>
  deep?: boolean
}

export type FunctionDirective<
  HostElement = any,
  V = any,
  Modifiers extends string = string,
  Arg extends string = string,
> = DirectiveHook<HostElement, any, V, Modifiers, Arg>

export type Directive<
  HostElement = any,
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> =
  | ObjectDirective<HostElement, Value, Modifiers, Arg>
  | FunctionDirective<HostElement, Value, Modifiers, Arg>

export type DirectiveModifiers<K extends string = string> = Record<K, boolean>

export function validateDirectiveName(name: string): void {
  if (isBuiltInDirective(name)) {
    warn('Do not use built-in directive ids as custom directive id: ' + name)
  }
}

// Directive, value, argument, modifiers
export type DirectiveArguments = Array<
  | [Directive | undefined]
  | [Directive | undefined, any]
  | [Directive | undefined, any, string]
  | [Directive | undefined, any, string | undefined, DirectiveModifiers]
>

/**
 * Adds directives to a VNode.
 */
export function withDirectives<T extends VNode>(
  vnode: T,
  directives: DirectiveArguments,
): T {
  if (currentRenderingInstance === null) {
    __DEV__ && warn(`withDirectives can only be used inside render functions.`)
    return vnode
  }
  const instance = getComponentPublicInstance(currentRenderingInstance)
  const bindings: DirectiveBinding[] = vnode.dirs || (vnode.dirs = [])
  for (let i = 0; i < directives.length; i++) {
    // const _directive_pin = _resolveDirective('pin')
    // const _directive_foo = _resolveDirective('foo')
    // 可以绑定多个指令
    // 不是内置的指令, 不会产生额外的 vnode 属性
    // <p v-pin:[arg].mod="val" v-foo.mod></p>
    // [
    //   [_directive_pin, _ctx.val, _ctx.arg, { mod: true }],
    //   [_directive_foo,   void 0,   void 0, { mod: true }],
    //    name,             value,    arg,    modifiers
    // ]

    // 内置指令 v-model, 除了产生指令外, 还会产生额外的 vnode 属性
    // <input v-model.mod1.mod2='val'/>
    // [ [ _vModelText, _ctx.val, void 0, { mod1: true, mod2: true } ] ]
    // props: { "onUpdate:modelValue": $event => ((_ctx.c) = $event) }
    // 这里的 _vModelText 来自 import { vModelText } from "vue";
    // return _withDirectives((_openBlock(), _createElementBlock("input", {
    //   "onUpdate:modelValue": $event => ((_ctx.val) = $event)
    // }, null, 8 /* PROPS */, ["onUpdate:modelValue"])), [
    //   [ _vModelText, _ctx.val, void 0, { mod1: true, mod2: true } ]
    // ])

    // 内置指令 v-model 在组件上面使用, 还会产生额外的 vnode 属性
    // <Foo v-model.mod1.mod2='val'/>
    // return (_openBlock(), _createBlock(_component_Foo, {
    //   modelValue: _ctx.val,
    //   "onUpdate:modelValue": $event => ((_ctx.val) = $event),
    //   modelModifiers: { mod1: true, mod2: true }
    // }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]))
    // 在 Foo 组件中, 可以执行 this.$emit('update:modelValue', val)
    // <input
    //   :value="props.modelValue"
    //   @input="$emit('update:modelValue', $event.target.value)"
    // />

    // <F v-model:foo-bar.mod1.mod2='val'/>
    // return (_openBlock(), _createBlock(_component_F, {
    //   "foo-bar": _ctx.val,
    //   "onUpdate:fooBar": $event => ((_ctx.val) = $event),
    //   "foo-barModifiers": { mod1: true, mod2: true }
    // }, null, 8 /* PROPS */, ["foo-bar", "onUpdate:fooBar"]))
    // 在 Foo 组件中, 可以执行 this.$emit('update:modelValue', val)
    // <input
    //   :value="props['foo-bar']"
    //   @input="$emit('update:fooBar', $event.target.value)"
    // />

    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i]
    if (dir) {
      if (isFunction(dir)) {
        // 将函数式组件转为对象指令的写法
        dir = {
          mounted: dir,
          updated: dir,
        } as ObjectDirective
      }
      if (dir.deep) {
        traverse(value)
      }
      // 将指令放入到 vnode.dirs 中 同 instance 绑定
      // 这是在创建 组件的 subTree 中执行的
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers,
      })
    }
  }
  return vnode
}

export function invokeDirectiveHook(
  vnode: VNode,
  prevVNode: VNode | null,
  instance: ComponentInternalInstance | null,
  name: keyof ObjectDirective,
): void {
  const bindings = vnode.dirs!
  const oldBindings = prevVNode && prevVNode.dirs!
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i]
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value
    }
    // 这里传入的 name 在组件不同的生命周期钩子函数中, 可以是 mounted, updated, ... 等不同的值
    // dir: {
    //   mounted(el, binding, vnode, prevVNode) {
    //     const { dir, instance, value, oldValue, arg, modifiers } = binding
    //   },
    //   updated(el, binding, vnode, prevVNode) {
    //     const { dir, instance, value, oldValue, arg, modifiers } = binding
    //   },
    // }
    let hook = binding.dir[name] as DirectiveHook | DirectiveHook[] | undefined
    if (__COMPAT__ && !hook) {
      hook = mapCompatDirectiveHook(name, binding.dir, instance)
    }
    if (hook) {
      // disable tracking inside all lifecycle hooks
      // since they can potentially be called inside effects.
      pauseTracking()
      callWithAsyncErrorHandling(hook, instance, ErrorCodes.DIRECTIVE_HOOK, [
        vnode.el,
        binding,
        vnode,
        prevVNode,
      ])
      resetTracking()
    }
  }
}
