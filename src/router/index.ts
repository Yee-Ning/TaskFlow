/**
 * Vue Router 路由配置
 *
 * 路由清单：
 * - /login      登录页
 * - /register   注册页
 * - /           主页面（需要登录）
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import store from '../store'

// 路由懒加载
const Login = () => import('../views/Login.vue')
const Register = () => import('../views/Register.vue')
const Home = () => import('../views/Home.vue')

const routes: RouteRecordRaw[] = [
    {
        path: '/login',
        name: 'Login',
        component: Login,
        meta: { requiresAuth: false, title: '登录' },
    },
    {
        path: '/register',
        name: 'Register',
        component: Register,
        meta: { requiresAuth: false, title: '注册' },
    },
    {
        path: '/forgot-password',
        name: 'ForgotPassword',
        component: () => import('../views/ForgotPassword.vue'),
        meta: { requiresAuth: false, title: '找回密码' },
    },
    {
        path: '/',
        name: 'Home',
        component: Home,
        meta: { requiresAuth: true, title: '任务管理' },
    },
    {
        path: '/statistics',
        name: 'Statistics',
        component: () => import('../views/Statistics.vue'),
        meta: { requiresAuth: true, title: '数据统计' },
    },
    {
        path: '/settings',
        name: 'Settings',
        component: () => import('../views/Settings.vue'),
        meta: { requiresAuth: true, title: '设置' },
    },
    {
        path: '/auxiliary',
        name: 'Auxiliary',
        component: () => import('../views/AuxiliaryFeatures.vue'),
        meta: { requiresAuth: true, title: '辅助功能' },
    },
]

const router = createRouter({
    // Electron 中必须使用 hash 模式
    history: createWebHashHistory(),
    routes,
})

/**
 * 全局路由守卫
 * - 未登录用户访问需要认证的页面 → 重定向到登录页
 * - 已登录用户访问登录/注册页 → 重定向到主页
 */
router.beforeEach((to, _from, next) => {
    const isLoggedIn = store.getters['user/isLoggedIn']

    if (to.meta.requiresAuth && !isLoggedIn) {
        // 需要登录但未登录 → 跳转到登录页
        next({ name: 'Login' })
    } else if (!to.meta.requiresAuth && isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
        // 已登录但访问登录/注册页 → 跳转到主页
        next({ name: 'Home' })
    } else {
        next()
    }
})

export default router
