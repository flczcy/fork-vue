import {
  EMPTY_ARR,
  PatchFlags,
  ShapeFlags,
  SlotFlags,
  extend,
  isArray,
  isFunction,
  isObject,
  isOn,
  isString,
  normalizeClass,
  normalizeStyle,
} from '@vue/shared'
import {
  type ClassComponent,
  type Component,
  type ComponentInternalInstance,
  type ConcreteComponent,
  type Data,
  isClassComponent,
} from './component'
import type { RawSlots } from './componentSlots'
import {
  type ReactiveFlags,
  type Ref,
  isProxy,
  isRef,
  toRaw,
} from '@vue/reactivity'
import type { AppContext } from './apiCreateApp'
import {
  type Suspense,
  type SuspenseBoundary,
  type SuspenseImpl,
  isSuspense,
} from './components/Suspense'
import type { DirectiveBinding } from './directives'
import {
  type TransitionHooks,
  setTransitionHooks,
} from './components/BaseTransition'
import { warn } from './warning'
import {
  type Teleport,
  type TeleportImpl,
  isTeleport,
} from './components/Teleport'
import {
  currentRenderingInstance,
  currentScopeId,
} from './componentRenderContext'
import type { RendererElement, RendererNode } from './renderer'
import { NULL_DYNAMIC_COMPONENT } from './helpers/resolveAssets'
import { hmrDirtyComponents } from './hmr'
import { convertLegacyComponent } from './compat/component'
import { convertLegacyVModelProps } from './compat/componentVModel'
import { defineLegacyVNodeProperties } from './compat/renderFn'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { isInternalObject } from './internalObject'

export const Fragment = Symbol.for('v-fgt') as any as {
  __isFragment: true
  new (): {
    $props: VNodeProps
  }
}
export const Text: unique symbol = Symbol.for('v-txt')
export const Comment: unique symbol = Symbol.for('v-cmt')
export const Static: unique symbol = Symbol.for('v-stc')

export type VNodeTypes =
  | string
  | VNode
  | Component
  | typeof Text
  | typeof Static
  | typeof Comment
  | typeof Fragment
  | typeof Teleport
  | typeof TeleportImpl
  | typeof Suspense
  | typeof SuspenseImpl

export type VNodeRef =
  | string
  | Ref
  | ((
      ref: Element | ComponentPublicInstance | null,
      refs: Record<string, any>,
    ) => void)

export type VNodeNormalizedRefAtom = {
  /**
   * component instance
   */
  i: ComponentInternalInstance
  /**
   * Actual ref
   */
  r: VNodeRef
  /**
   * setup ref key
   */
  k?: string
  /**
   * refInFor marker
   */
  f?: boolean
}

export type VNodeNormalizedRef =
  | VNodeNormalizedRefAtom
  | VNodeNormalizedRefAtom[]

type VNodeMountHook = (vnode: VNode) => void
type VNodeUpdateHook = (vnode: VNode, oldVNode: VNode) => void
export type VNodeHook =
  | VNodeMountHook
  | VNodeUpdateHook
  | VNodeMountHook[]
  | VNodeUpdateHook[]

// https://github.com/microsoft/TypeScript/issues/33099
export type VNodeProps = {
  key?: PropertyKey
  ref?: VNodeRef
  ref_for?: boolean
  ref_key?: string

  // vnode hooks
  onVnodeBeforeMount?: VNodeMountHook | VNodeMountHook[]
  onVnodeMounted?: VNodeMountHook | VNodeMountHook[]
  onVnodeBeforeUpdate?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeUpdated?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeBeforeUnmount?: VNodeMountHook | VNodeMountHook[]
  onVnodeUnmounted?: VNodeMountHook | VNodeMountHook[]
}

type VNodeChildAtom =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | void

export type VNodeArrayChildren = Array<VNodeArrayChildren | VNodeChildAtom>

export type VNodeChild = VNodeChildAtom | VNodeArrayChildren

export type VNodeNormalizedChildren =
  | string
  | VNodeArrayChildren
  | RawSlots
  | null

export interface VNode<
  HostNode = RendererNode,
  HostElement = RendererElement,
  ExtraProps = { [key: string]: any },
> {
  /**
   * @internal
   */
  __v_isVNode: true

  /**
   * @internal
   */
  [ReactiveFlags.SKIP]: true

  type: VNodeTypes
  props: (VNodeProps & ExtraProps) | null
  key: PropertyKey | null
  ref: VNodeNormalizedRef | null
  /**
   * SFC only. This is assigned on vnode creation using currentScopeId
   * which is set alongside currentRenderingInstance.
   * 仅适用于单文件组件（SFC）。这是在虚拟节点（vnode）创建时使用 currentScopeId 进行赋值的，
   * currentScopeId 是与 currentRenderingInstance 一同设置的。
   */
  scopeId: string | null
  /**
   * SFC only. This is assigned to:
   * - Slot fragment vnodes with :slotted SFC styles.
   * - Component vnodes (during patch/hydration) so that its root node can
   *   inherit the component's slotScopeIds
   * @internal
   */
  slotScopeIds: string[] | null
  children: VNodeNormalizedChildren
  component: ComponentInternalInstance | null
  dirs: DirectiveBinding[] | null
  transition: TransitionHooks<HostElement> | null

  // DOM
  el: HostNode | null
  anchor: HostNode | null // fragment anchor
  target: HostElement | null // teleport target
  targetStart: HostNode | null // teleport target start anchor
  targetAnchor: HostNode | null // teleport target anchor
  /**
   * number of elements contained in a static vnode
   * @internal
   */
  staticCount: number

  // suspense
  suspense: SuspenseBoundary | null
  /**
   * @internal
   */
  ssContent: VNode | null
  /**
   * @internal
   */
  ssFallback: VNode | null

  // optimization only
  shapeFlag: number
  patchFlag: number
  /**
   * @internal
   */
  dynamicProps: string[] | null
  /**
   * @internal
   */
  dynamicChildren: (VNode[] & { hasOnce?: boolean }) | null

  // application root node only
  appContext: AppContext | null

  /**
   * @internal lexical scope owner instance
   */
  ctx: ComponentInternalInstance | null

  /**
   * @internal attached by v-memo
   */
  memo?: any[]
  /**
   * @internal index for cleaning v-memo cache
   */
  cacheIndex?: number
  /**
   * @internal __COMPAT__ only
   */
  isCompatRoot?: true
  /**
   * @internal custom element interception hook
   */
  ce?: (instance: ComponentInternalInstance) => void
}

// Since v-if and v-for are the two possible ways node structure can dynamically
// change, once we consider v-if branches and each v-for fragment a block, we
// can divide a template into nested blocks, and within each block the node
// structure would be stable. This allows us to skip most children diffing
// and only worry about the dynamic nodes (indicated by patch flags).
export const blockStack: VNode['dynamicChildren'][] = []
export let currentBlock: VNode['dynamicChildren'] = null

// blockTree - 收集子元素中的动态节点 - 将子节点的动态节点间(嵌套)收集到数组,进行扁平化
// diff children 时,只需要 diff 这些收集的动态子节点即可
// 1) 模板编译优化, 增添了 patchFlag 标识具体的 vnode 节点
// 2) block 收集这些被打上 patchFlag 的 vnode, 对于不稳定的节点(vif,vfor)等实现 blockTree 嵌套的收集
// 以上 block tree 为靶向更新优化
// 除了 block 的靶向优化外, 还有 静态提升,函数缓存,预解析字符串

// const vnode =
// (_openBlock(),
// _createElementBlock('div', null, [
//   _createElementVNode('h1', null, 'Hi'),
//   _createElementVNode(
//     'span',
//     { class: _ctx.state.className },
//     _toDisplayString(_ctx.state.id),
//     1 | 2 /* TEXT,CLASS */,
//   ),
// ]))

// 用一个数组来收集多个动态节点

/**
 * Open a block.
 * This must be called before `createBlock`. It cannot be part of `createBlock`
 * because the children of the block are evaluated before `createBlock` itself
 * is called. The generated code typically looks like this:
 *
 * ```js
 * function render() {
 *   return (openBlock(),createBlock('div', null, [...]))
 * }
 * ```
 * disableTracking is true when creating a v-for fragment block, since a v-for
 * fragment always diffs its children.
 *
 * @private
 */

// 一个组件,其模板中会有多个动态节点, 在组件创建模板中各个 vnode 时, 将有动态节点的 vnode 进行收集, 后面组件更新时,
// 直接进行动态节点的逐个 patch 即可, 其他静态节点则无需 patch
// 每一个组件都是一个根 block, 因为其要收集 subTree 也即
// render 函数中的动态节点(模板编译传入的 patchFlag > 0 的节点, 看作是动态节点)
// 如何识别一个动态节点? 这是 vue 模板编译时, 通过 ast 词法分析字符串结构解析出的, 解析出不同的 token 的类型, 设置
// 不同的 PatchFlags, 只要是有动态节点, 不管是何种类型的动态节点, 那么设置的 patchFlag 至少是 > 0 的. 对于静态
// 节点, patchFlag 则为默认值 0.
// 所以组件的 render 函数(通过模板编译的,不是自己手动写的)都是 openBlock() 开始, 因为组件就是一个 block, 里面
// 有动态节点, 这是针对组件进行的, 执行创建的 createBaseVNode(... patchFlag), 判断传入的 patchFlag > 0 来将
// 此创建的 vnode 放入 vnode.dynamicChildren 中, 即 dynamicChildren 中都是当前组件的所有 vnode
// 中的 vnode.patchFlag > 0 的节点, 这里面进行了扁平化

// <Foo ref="foo" type="text" />
// <Input ref="inputRef" type="text" v-if='a' />
// return (_openBlock(), _createElementBlock(_Fragment, null, [
//   _createVNode(_component_Foo, { ref: "foo", type: "text" }, null, 512 /* NEED_PATCH */),
//   (_ctx.a)
//     ? (_openBlock(), _createBlock(_component_Input, { key: 0, ref: "inputRef", type: "text" }, null, 512 /* NEED_PATCH */))
//     : _createCommentVNode("v-if", true) ], 64 /* STABLE_FRAGMENT */))

export function openBlock(disableTracking = false): void {
  // 每次执行 openBlock(), 则将 currentBlock 设置新的值 []
  // 每次执行 openBlock(false), 则将 currentBlock 设置新的值 null
  blockStack.push((currentBlock = disableTracking ? null : []))
}

export function closeBlock(): void {
  blockStack.pop()
  currentBlock = blockStack[blockStack.length - 1] || null
}

// Whether we should be tracking dynamic child nodes inside a block.
// Only tracks when this value is > 0
// We are not using a simple boolean because this value may need to be
// incremented/decremented by nested usage of v-once (see below)
export let isBlockTreeEnabled = 1

/**
 * Block tracking sometimes needs to be disabled, for example during the
 * creation of a tree that needs to be cached by v-once. The compiler generates
 * code like this:
 * 默认, 组件(模板编译的)会自动收集内部的所有的动态节点到 dynamicChildren, 那么如何排除某个 vnode 不被动态节点收集呢?
 * 这里的案例是, 并不是组件的所有的动态节点都需要放入 dynamicChildren, 若是我只想要某一个特殊的动态节点
 * 不放入 dynamicChildren 中呢 ?
 * 这个可以通过在创建这个 vnode 前, 先禁止 disable blocking, 创建完后, 再开启 enable blocking
 *
 * ``` js
 * _cache[1] || (
 *   setBlockTracking(-1, true),
 *   _cache[1] = createVNode(...),
 *   setBlockTracking(1),
 *   _cache[1]
 * )
 * ```
 *
 * @private
 */
export function setBlockTracking(value: number, inVOnce = false): void {
  isBlockTreeEnabled += value
  if (value < 0 && currentBlock && inVOnce) {
    // mark current block so it doesn't take fast path and skip possible
    // nested components during unmount
    currentBlock.hasOnce = true
  }
}

function setupBlock(vnode: VNode) {
  // save current block children on the block vnode
  vnode.dynamicChildren =
    isBlockTreeEnabled > 0 ? currentBlock || (EMPTY_ARR as any) : null
  // close block
  closeBlock() // 执行完后, currentBlock 被设置为父层的 block
  // a block is always going to be patched, so track it as a child of its
  // parent block
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode)
  }
  return vnode
}

/**
 * @private
 */
// createVNode, createBlock, h: needFullChildrenNormalization 总是 true
// createBaseVNode,createElementBlock,createElementVNode: needFullChildrenNormalization 默认为 false
export function createElementBlock /* needFullChildrenNormalization: false */(
  type: string | typeof Fragment, // 专门针对 元素/Fragment vnode block
  props?: Record<string, any> | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[],
  shapeFlag?: number,
): VNode {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag /* 有默认值, 可不传; type === Fragment ? 0 : ShapeFlags.ELEMENT */,
      true /* isBlock: prevent a block from tracking itself */,
      /*
       * isBlock: 主要是标识当前的 vnode 自身为 block, 在 createBaseVNode 中不要将自己收集到 block 中,
       * 因为当前的 vnode 是给父层的 currentBlock 收集的, 自己就不要再收集自己到自己所在层级 currentBlock 中
       */
      // false, /* needFullChildrenNormalization */ 这里不传, 有默认值 false
    ),
  )
}

// <Foo ref="foo" type="text" />
// <Input ref="inputRef" type="text" v-if='a' />
// return (_openBlock(), _createElementBlock(_Fragment, null, [
//   _createVNode(_component_Foo, { ref: "foo", type: "text" }, null, 512 /* NEED_PATCH */),
//   (_ctx.a)
//     ? (_openBlock(), _createBlock(_component_Input, { key: 0, ref: "inputRef", type: "text" }, null, 512 /* NEED_PATCH */))
//     : _createCommentVNode("v-if", true) ], 64 /* STABLE_FRAGMENT */))

/**
 * Create a block root vnode. Takes the same exact arguments as `createVNode`.
 * A block root keeps track of dynamic nodes within the block in the
 * `dynamicChildren` array.
 *
 * @private
 */
// createVNode, createBlock, h: needFullChildrenNormalization 总是 true
// createBaseVNode,createElementBlock,createElementVNode: needFullChildrenNormalization 默认为 false
export function createBlock /* needFullChildrenNormalization: true */(
  type: VNodeTypes | ClassComponent, // 专门针对 除了元素/fragment 的 vnode 类型
  props?: Record<string, any> | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[],
): VNode {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true /* isBlock: prevent a block from tracking itself */,
      // true /* needFullChildrenNormalization: createVNode 内部传给 createBaseVNode 显式的传 true */,
    ),
    // 与 createBaseVNode 区别就是:
    // createVNode 函数内部会分析各种传入的 type 确定 shapeFlag
    // createBaseVNode 内部自己不会确定 shapeFlag, 需要外部传入 shapeFlag, 不传默认就是 ShapeFlags.ELEMENT
    // 所以在模板编译的 render 函数在 ast 分析中对元素vnode会提前知道,因为是字符,
    // 所以就确定 shapeFlag 为 ShapeFlags.ELEMENT, 此时直接调用 createBaseVNode 即可,
    // 其模板中的 createElementVNode 就是 createBaseVNode 的别名
  )
}

export function isVNode(value: any): value is VNode {
  return value ? value.__v_isVNode === true : false
}

export function isSameVNodeType(n1: VNode, n2: VNode): boolean {
  if (__DEV__ && n2.shapeFlag & ShapeFlags.COMPONENT && n1.component) {
    const dirtyInstances = hmrDirtyComponents.get(n2.type as ConcreteComponent)
    if (dirtyInstances && dirtyInstances.has(n1.component)) {
      // #7042, ensure the vnode being unmounted during HMR
      // bitwise operations to remove keep alive flags
      n1.shapeFlag &= ~ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
      n2.shapeFlag &= ~ShapeFlags.COMPONENT_KEPT_ALIVE
      // HMR only: if the component has been hot-updated, force a reload.
      return false
    }
  }
  return n1.type === n2.type && n1.key === n2.key
}

let vnodeArgsTransformer:
  | ((
      args: Parameters<typeof _createVNode>,
      instance: ComponentInternalInstance | null,
    ) => Parameters<typeof _createVNode>)
  | undefined

/**
 * Internal API for registering an arguments transform for createVNode
 * used for creating stubs in the test-utils
 * It is *internal* but needs to be exposed for test-utils to pick up proper
 * typings
 */
export function transformVNodeArgs(
  transformer?: typeof vnodeArgsTransformer,
): void {
  vnodeArgsTransformer = transformer
}

const createVNodeWithArgsTransform = (
  ...args: Parameters<typeof _createVNode>
): VNode => {
  return _createVNode(
    ...(vnodeArgsTransformer
      ? vnodeArgsTransformer(args, currentRenderingInstance)
      : args),
  )
}

const normalizeKey = ({ key }: VNodeProps): VNode['key'] =>
  key != null ? key : null

// <Foo ref="foo" type="text" />
// <input ref="input">
// <ul>
//   <li v-for="item in list" ref="items" key="item.id">
//     {{ item }}
//   </li>
// </ul>
// _createVNode(_component_Foo, { ref: "foo", type: "text" }, null, 512 /* NEED_PATCH */),
// _createElementVNode("input", { ref: "input" }, null, 512 /* NEED_PATCH */),
// _createElementVNode("ul", null, [
//   (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(_ctx.list, (item) => {
//     return (_openBlock(), _createElementBlock("li", {
//       ref_for: true,
//       ref: "items",
//       key: "item.id"
//     }, _toDisplayString(item), 513 /* TEXT, NEED_PATCH */))
//   }), 256 /* UNKEYED_FRAGMENT */))
// ])
const normalizeRef = ({
  ref, // string,ref,function,array
  ref_key, // 在编译阶段生成的唯一标识符
  ref_for, // 是在编译到 v-for 是由编译器添加的
}: VNodeProps): VNodeNormalizedRefAtom | null => {
  if (typeof ref === 'number') {
    ref = '' + ref
  }
  // ref_key : 在编译阶段生成的唯一标识符，用于区分同一个父节点下的多个 ref，确保在更新过程中正确地识别和处理这些
  return (
    ref != null
      ? isString(ref) || isRef(ref) || isFunction(ref)
        ? // // ref 若是存在, 说明一定是在组件中, 这里的 currentRenderingInstance 应该是渲染 ref 所在目标的
          // // 父组件, 因为是从父组件中获取子组件的实例的, 所以一定是在组件实例中
          // // 此时这里是创建 vnode 阶段, 还不是 patch, 所以这里的 currentRenderingInstance 一定是父组件实例
          // // 因为此时的 patch 还没有调用, 属于是创建 subTree 的过程中
          { i: currentRenderingInstance, r: ref, k: ref_key, f: !!ref_for }
        : ref // 上面判断不是字符串,不是ref,不是函数,那么这里可以是数组
      : null
  ) as any
}

// 别名: createElementVNode, 专门用在 vue 模板的编译中
// createVNode, createBlock, h: needFullChildrenNormalization 总是 true
// createBaseVNode,createElementBlock,createElementVNode: needFullChildrenNormalization 默认为 false
function createBaseVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag = 0,
  dynamicProps: string[] | null = null,
  shapeFlag: number = type === Fragment ? 0 : ShapeFlags.ELEMENT,
  isBlockNode = false,
  // 若是来自 vue 的模板编译创建的 vnode, 则是不需要进行 vnode 的 children 的 normalization
  // 这是因为 vue 的模板编译时, 在 ast 拼接字符串时, 已经确保 vnode 的 children 是 nomal 的
  // 但是若是 通过 用户的 h 函数创建的 vnode, 那么则需要对 children 进行 normalization, 这是因为
  // 用户创建的 vnode , 其 children 可以非常灵活, 需要进行 normalization
  needFullChildrenNormalization = false,
): VNode {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null, // patch 时创建组件后赋值
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null, // patch() 时创建元素后赋值
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    // 只有组件才有 subTree, 调用组件的 render 函数时设置 currentRenderingInstance 为
    // 创建 vnode 时, 对应的组件
    // 这里的 vnode.ctx 在组件的 调用 instance.render() 函数时进行设置
    // const prev = setCurrentRenderingInstance(i)
    // 在创建组件的 subTree(vnode) 时, 组件实例
    // subtTree = instance.render() {
    //   return createVNode('div', props, children) {
    //     const vnode = {
    //       ctx: currentRenderingInstance, // 此时这里的 currentRenderingInstance 已经被设置
    //       // 即 createBaseVNode 是在组件的创建/更新中执行的(因为组件要创建 subTree)
    //     }
    //     return vnode
    //   }
    // }
    // setCurrentRenderingInstance(prev)
    ctx: currentRenderingInstance, // patch 时创建组件后赋值(这里为创建的 App 组件实例)
  } as VNode

  // createVNode, createBlock, h: needFullChildrenNormalization 总是 true
  // createBaseVNode,createElementBlock,createElementVNode: needFullChildrenNormalization 默认 false
  if (needFullChildrenNormalization) {
    // 来自 h 函数, 或者来自模板编译的 createVNode, createBlock
    normalizeChildren(vnode, children)
    // normalize suspense children
    if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
      ;(type as typeof SuspenseImpl).normalize(vnode)
    }
  } else if (children) {
    // 来自模板编译(compiled) 中的 createElementBlock(), createElementVNode:
    // 其 children 的类型只能是 string or Array
    // needFullChildrenNormalization 为 false
    // compiled element vnode - if children is passed, only possible types are
    // string or Array.
    vnode.shapeFlag |= isString(children)
      ? ShapeFlags.TEXT_CHILDREN
      : ShapeFlags.ARRAY_CHILDREN
  }

  // validate key
  if (__DEV__ && vnode.key !== vnode.key) {
    warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type)
  }

  // 这里与 vue-router 收集路由将树状结构的路由扁平化的逻辑类似, 路由是收集到 matches 数组中
  // 这里是收集到 currentBlock 数组中, 都是进行扁平化收集
  // track vnode for block tree
  if (
    isBlockTreeEnabled > 0 &&
    // avoid a block node from tracking itself
    !isBlockNode &&
    // has current parent block
    currentBlock &&
    // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    (vnode.patchFlag > 0 || shapeFlag & ShapeFlags.COMPONENT) &&
    // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    vnode.patchFlag !== PatchFlags.NEED_HYDRATION
    // 注意这里不是包含的关系, vnode.patchFlag 表示只有一种标识 PatchFlags.NEED_HYDRATION
  ) {
    currentBlock.push(vnode)
  }

  if (__COMPAT__) {
    convertLegacyVModelProps(vnode)
    defineLegacyVNodeProperties(vnode)
  }

  return vnode
}

export { createBaseVNode as createElementVNode }

// vue 的 vnode 其实是分为 两类:
// 一类是来自模板创建的 vnode
//   模板创建的 vnode 会有动态节点/静态节点的优化标识(即 patchFlag), 可以进行 fast path 比对更新
// 一类是来自用户手写的 render 函数中创建的 vnode
//   用户通过 手写 render 函数创建的 vnode, 则没有任何优化标识, 需要深度遍历比对更新

// 这里是暴露给外部 h 函数的, 故这里的 patchFlag 默认为 0, dynamicProps 为 null, isBlockNode 为 false
// h(a, null, [...]) -> createVNode(a, null, children, 0, null, false)
// h 函数只接受 3 个参数 内部调用 createVNode(),
// 后面的三个参数(patchFlag, dynamicProps, isBlockNode)传入默认值 是专门正对 vue 模板编译函数的, 正对的是
// 模板编译时的优化参数(flags), 与运行时无关, h 函数就是手动创建运行时的 vnode 函数, 这也就是 vue jsx 中调用
// 的 h 函数
// h(type, propsOrChildren, children) {
//   (type, propsOrChildren, children) {
//     return createBaseVNode(
//       type,
//       props,
//       children,
//       0, /* patchFlag */,
//       null, /* dynamicProps */,
//       shapeFlag,
//       false, /* isBlockNode */,
//       这里是 h/createVNode 函数, 是用户手动创建的 vnode, 故这里需要 children normalization
//       true /* needFullChildrenNormalization */,
//     }
//   }
// }
// <Foo ref="foo" type="text" />
// _createVNode(_component_Foo, { ref: "foo", type: "text" }, null, 512 /* NEED_PATCH */),
// 模板编译时, 遇到组件, 也会调用 createVNode
// createVNode 被调用, 那么 needFullChildrenNormalization 总是为 true
export const createVNode = (
  __DEV__ ? createVNodeWithArgsTransform : _createVNode
) as typeof _createVNode

function _createVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null,
  isBlockNode = false,
): VNode {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (__DEV__ && !type) {
      warn(`Invalid vnode type when creating vnode: ${type}.`)
    }
    type = Comment
  }

  if (isVNode(type)) {
    // createVNode receiving an existing vnode. This happens in cases like
    // <component :is="vnode"/>
    // #2078 make sure to merge refs during the clone instead of overwriting it
    const cloned = cloneVNode(type, props, true /* mergeRef: true */)
    if (children) {
      normalizeChildren(cloned, children)
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & ShapeFlags.COMPONENT) {
        currentBlock[currentBlock.indexOf(type)] = cloned
      } else {
        currentBlock.push(cloned)
      }
    }
    cloned.patchFlag = PatchFlags.BAIL
    return cloned
  }

  // class component normalization.
  if (isClassComponent(type)) {
    type = type.__vccOpts
  }

  // 2.x async/functional component compat
  if (__COMPAT__) {
    type = convertLegacyComponent(type, currentRenderingInstance)
  }

  // class & style normalization.
  if (props) {
    // for reactive or proxy objects, we need to clone it to enable mutation.
    props = guardReactiveProps(props)!
    let { class: klass, style } = props
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass)
    }
    if (isObject(style)) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style)
      }
      props.style = normalizeStyle(style)
    }
  }

  // encode the vnode type information into a bitmap
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : __FEATURE_SUSPENSE__ && isSuspense(type)
      ? ShapeFlags.SUSPENSE
      : isTeleport(type)
        ? ShapeFlags.TELEPORT
        : isObject(type)
          ? ShapeFlags.STATEFUL_COMPONENT
          : isFunction(type)
            ? ShapeFlags.FUNCTIONAL_COMPONENT
            : 0

  if (__DEV__ && shapeFlag & ShapeFlags.STATEFUL_COMPONENT && isProxy(type)) {
    type = toRaw(type)
    warn(
      `Vue received a Component that was made a reactive object. This can ` +
        `lead to unnecessary performance overhead and should be avoided by ` +
        `marking the component with \`markRaw\` or using \`shallowRef\` ` +
        `instead of \`ref\`.`,
      `\nComponent that was made reactive: `,
      type,
    )
  }

  // <Foo ref="foo" type="text" />
  // _createVNode(_component_Foo, { ref: "foo", type: "text" }, null, 512 /* NEED_PATCH */),
  // 模板编译时, 遇到组件, 也会调用 createVNode, 此时 needFullChildrenNormalization 则是显式的传入 true
  // 也就是对于模板中的组件, needFullChildrenNormalization 为 true
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag, // 0
    dynamicProps, // null
    shapeFlag,
    isBlockNode, // false
    // 若是来自 vue 的模板编译创建的 vnode, 则是不需要进行 vnode 的 children 的 normalization
    // 这是因为 vue 的模板编译时, 在 ast 拼接字符串时, 已经确保 vnode 的 children 是 nomal 的
    // 但是若是 通过 用户的 h 函数创建的 vnode, 那么则需要对 children 进行 normalization, 这是因为
    // 用户创建的 vnode , 其 children 可以非常灵活, 需要进行 normalization
    // 同时注意 模板中若是组件, 也是会调用 createVNode, 这里需要 needFullChildrenNormalization 设置为 true
    // createVNode 被调用, 那么 needFullChildrenNormalization 总是为 true
    true /* needFullChildrenNormalization */,
  )
}

export function guardReactiveProps(
  props: (Data & VNodeProps) | null,
): (Data & VNodeProps) | null {
  if (!props) return null
  return isProxy(props) || isInternalObject(props) ? extend({}, props) : props
}

// 什么场景需要使用 cloneVNode? 这里的 cloneVNode 作用是什么?
// n1 - render(h('li', {class: 'foo'}, '1'), app)
// n2 - render(h('li', {class: 'bar'}, '2'), app)
// 第一次渲染创建 vnode n1, 第二次渲染创建 vnode n2 - 进行 patch(n1, n2)
//   - 若是不进行 cloneVNode(n1) 那么每次 更新 render 都要执行 createVNode('li'...),
//     每次都创建一个新的 vnode(对象) 需要分配内存 性能相对复制已经创建的 vnode n1 要低
//   - 若是更新,说明组件已经挂载,第二次以及之后的 render(h(...)) 就不再去创建新的 vnode 了,直接复用之前创建的
//     vnode, 相比之前创建的 vnode, 只是 n2 的 props 会变化, 将这些变化的部分更新到复制的 vnode
//   - 创建 vnode 不涉及到组件的生命周期钩子函数, 基本上每次更新都会创建新的 vnode 进行 patch, 不过 vue 内部
//     对于已经挂载过的 vnode 会进行复用, 避免了每次更新都创建新的 vnode 对象(分配内存)
//   - 对于静态 vnode, 则可以完全复用(clone)之前的 vnode, 而不是创建新的 vnode
export function cloneVNode<T, U>(
  vnode: VNode<T, U>,
  extraProps?: (Data & VNodeProps) | null,
  mergeRef = false,
  cloneTransition = false,
): VNode<T, U> {
  // This is intentionally NOT using spread or extend to avoid the runtime
  // key enumeration cost.
  const { props, ref, patchFlag, children, transition } = vnode
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props
  const cloned: VNode<T, U> = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref:
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
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children:
      __DEV__ && patchFlag === PatchFlags.CACHED && isArray(children)
        ? (children as VNode[]).map(deepCloneVNode)
        : children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
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

  if (__COMPAT__) {
    defineLegacyVNodeProperties(cloned as VNode)
  }

  return cloned
}

/**
 * Dev only, for HMR of hoisted vnodes reused in v-for
 * https://github.com/vitejs/vite/issues/2022
 */
function deepCloneVNode(vnode: VNode): VNode {
  const cloned = cloneVNode(vnode)
  if (isArray(vnode.children)) {
    cloned.children = (vnode.children as VNode[]).map(deepCloneVNode)
  }
  return cloned
}

/**
 * @private
 */
export function createTextVNode(text: string = ' ', flag: number = 0): VNode {
  return createVNode(Text, null, text, flag)
}

/**
 * @private
 */
export function createStaticVNode(
  content: string,
  numberOfNodes: number,
): VNode {
  // A static vnode can contain multiple stringified elements, and the number
  // of elements is necessary for hydration.
  const vnode = createVNode(Static, null, content)
  vnode.staticCount = numberOfNodes
  return vnode
}

/**
 * @private
 */
export function createCommentVNode(
  text: string = '',
  // when used as the v-else branch, the comment node must be created as a
  // block to ensure correct updates.
  asBlock: boolean = false,
): VNode {
  return asBlock
    ? (openBlock(), createBlock(Comment, null, text))
    : createVNode(Comment, null, text)
}

// null, true, false, undefined -> createVNode(Comment) - empty placeholder
// [vnode, 'txt', Text, true, null]
export function normalizeVNode(child: VNodeChild): VNode {
  if (child == null || typeof child === 'boolean') {
    // empty placeholder
    return createVNode(Comment)
  } else if (isArray(child)) {
    // fragment
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice(),
    )
  } else if (isVNode(child)) {
    // already vnode, this should be the most common since compiled templates
    // always produce all-vnode children arrays
    return cloneIfMounted(child)
  } else {
    // strings and numbers
    return createVNode(Text, null, String(child))
  }
}

// optimized normalization for template-compiled render fns
export function cloneIfMounted(child: VNode): VNode {
  return (child.el === null && child.patchFlag !== PatchFlags.CACHED) ||
    child.memo
    ? child
    : cloneVNode(child)
}

export function normalizeChildren(vnode: VNode, children: unknown): void {
  let type = 0
  const { shapeFlag } = vnode
  if (children == null) {
    children = null
  } else if (isArray(children)) {
    // 组件,元素,Fragment 等 vnode 的 children 都可以是数组
    // [h(Foo, null, {}), h(div, 'hi', []), h(Text, 1)]
    // 若是数组, 也会先执行数组里面的 h 函数, 返回具体的 vnode
    // 所以数组里面的元素已经先执行了 normalizeChildren(vnode), 通过每个元素执行的 h 函数
    // 数组同时说明每个数组元素已经执行过了 normalizeChildren
    type = ShapeFlags.ARRAY_CHILDREN
  } else if (typeof children === 'object') {
    // 这里是针对元素 vnode, 其 children 也被传成了对象,
    if (shapeFlag & (ShapeFlags.ELEMENT | ShapeFlags.TELEPORT)) {
      // 元素 vnode, children 传入的为对象
      // 正常创建 div 元素 vnode, 那么其 children 应为数组, 但是若是传入了对象,
      // 那么就只认可其对象中的 default 对应的 vnode, 为传入元素的 children
      // 此时取出对象中的 default() 对应的 children, 将这个 children 作为 vnode 的 children 进行
      // normalizeChildren(vnode, default()){
      //   const children = default()
      //   vnode.children = children
      //   vnode.shapeFlag |= typeof children
      // }
      // 因为只有组件的 children 是可以传入对象的, 当然组件 vnode 的 children 也是可以传入数组的,
      // 那么对于组件 vnode, 其 children 为数组, 则默认放入对象的 default 中
      // h(div, null, {
      //   header: () => h('p', 'hader'),
      //   footer: () => h('p', 'footer'),
      //   default: () => h('p', 'default'),
      //   default: withCtx(() => h('p', 'default')), 经过 withCtx 包装的都会有 _c 标识
      // })
      // Normalize slot to plain children for plain element and Teleport
      const slot = (children as any).default
      if (slot) {
        // _c marker is added by withCtx() indicating this is a compiled slot
        // _d disable block tracking 标志用于指示是否需要禁用块跟踪(block tracking)
        slot._c && (slot._d = false) // enabled block tracking
        // withCtx 在模板编译中,h 函数中都会调用的
        // 如果是 slot._c 存在, 表示是经过 withCtx 编译过来的, 那么可以进行 block tracking
        normalizeChildren(vnode, slot())
        // 若不是 slot._c, 即表示 h 函数过来的那么, 不设置 slot._d = false
        // 即 h 函数过来的不会设置 slot._d = false, 所以 h 函数中是禁止 block tracking
        slot._c && (slot._d = true) // disable block tracking
        // 如果是 slot._c 存在, 表示为 withCtx 编译过来的, 那么此时执行完后禁止 block tracking
      }
      return
    } else {
      // 否则 shapeFlag 为组件 vnode
      // 传入的是对象表示插槽
      // h(Com, null, {
      //   header: () => h('p', 'hader'),
      //   footer: () => h('p', 'footer'),
      //   default: () => h('p', 'default')
      // })
      // 标记此 vnode shapeFlag 为带有插槽的 vnode
      // 只有组件才会有 slot, 所以这个 vnode 一定是一个组件 vnode
      type = ShapeFlags.SLOTS_CHILDREN
      // _ 标识标识这里的 slot 对象是来自编译器生成的 slot, 不是用户 h 函数手动创建的 slot
      const slotFlag = (children as RawSlots)._
      // 这里通过模板编译调用传入的 children 是有 _ 标识的, 那么这里就不会设置 _ctx 属性
      if (!slotFlag && !isInternalObject(children)) {
        // if slots are not normalized, attach context instance
        // (compiled / normalized slots already have context)
        // <Foo ref='foo'>
        //   default
        //   <template #foo>foo</template>
        // </Foo>
        // compiled:
        // h(Foo, {ref: 'foo'}, {
        //   foo: _withCtx(() => [_createTextVNode('foo')]),
        //   default: _withCtx(() => [_createTextVNode(" default ")], undefined, true),
        //   _: 1 /* STABLE */
        // })
        // withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot)
        ;(children as RawSlots)._ctx = currentRenderingInstance
      } else if (slotFlag === SlotFlags.FORWARDED && currentRenderingInstance) {
        // parent:
        // <div>
        //   <Bar> <slot> </Bar> slot 作为组件 Bar 的 slot
        //         |-> 这里的 slot 是由 parent 中传入的 slot 决定的,
        //             所以这里 Bar.slots 的 stable 也是由 parent 决定的
        // </div>
        // <Parent> 2 </Parent> -> <Bar> 1 </Bar> -> 最终传入到 Bar 组件中 slot
        // 至于这里的 slot 节点是否有动态节点,也是通过编译器进行词法结构分析设置的, 若是静态的 slot vnode, 那么
        // slots._ 就等于 SlotFlags.STABLE, 否则有动态 slots 中有动态节点, 那么
        // slots._ 就等于 SlotFlags.DYNAMIC,
        // 同时若是转发的 slots, 那么其 children 的 _ 也是与父节点的 slots_ 一致
        // a child component receives forwarded slots(插槽转发) from the parent.
        // its slot type is determined by its parent's slot type.
        if (
          (currentRenderingInstance.slots as RawSlots)._ === SlotFlags.STABLE
        ) {
          ;(children as RawSlots)._ = SlotFlags.STABLE
        } else {
          ;(children as RawSlots)._ = SlotFlags.DYNAMIC
          vnode.patchFlag |= PatchFlags.DYNAMIC_SLOTS
        }
      }
    }
  } else if (isFunction(children)) {
    children = { default: children, _ctx: currentRenderingInstance }
    type = ShapeFlags.SLOTS_CHILDREN
  } else {
    children = String(children)
    // force teleport children to array so it can be moved around
    if (shapeFlag & ShapeFlags.TELEPORT) {
      type = ShapeFlags.ARRAY_CHILDREN
      children = [createTextVNode(children as string)]
    } else {
      type = ShapeFlags.TEXT_CHILDREN
    }
  }
  vnode.children = children as VNodeNormalizedChildren
  vnode.shapeFlag |= type
}

export function mergeProps(...args: (Data & VNodeProps)[]): Data {
  const ret: Data = {}
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i]
    for (const key in toMerge) {
      if (key === 'class') {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class])
        }
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style])
      } else if (isOn(key)) {
        const existing = ret[key]
        const incoming = toMerge[key]
        if (
          incoming &&
          existing !== incoming &&
          !(isArray(existing) && existing.includes(incoming))
        ) {
          ret[key] = existing
            ? [].concat(existing as any, incoming as any)
            : incoming
        }
      } else if (key !== '') {
        ret[key] = toMerge[key]
      }
    }
  }
  return ret
}

export function invokeVNodeHook(
  hook: VNodeHook,
  instance: ComponentInternalInstance | null,
  vnode: VNode,
  prevVNode: VNode | null = null,
): void {
  callWithAsyncErrorHandling(hook, instance, ErrorCodes.VNODE_HOOK, [
    vnode,
    prevVNode,
  ])
}
