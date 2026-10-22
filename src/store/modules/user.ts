/**
 * Vuex 用户模块
 *
 * 管理用户登录状态、用户信息
 * 支持登录状态持久化（localStorage）
 */

import type { Module } from 'vuex'
import { authApi, userApi, type SafeUser, type AuthResponse } from '../../api/database'

// ==================== State ====================

export interface UserState {
    /** 当前登录用户信息 */
    currentUser: SafeUser | null
    /** 登录状态加载中 */
    loading: boolean
}

// localStorage 中的存储 key
const STORAGE_KEY = 'task_manager_user'

/**
 * 从 localStorage 恢复用户信息
 */
function loadUserFromStorage(): SafeUser | null {
    try {
        const data = localStorage.getItem(STORAGE_KEY)
        if (data) {
            return JSON.parse(data) as SafeUser
        }
    } catch {
        localStorage.removeItem(STORAGE_KEY)
    }
    return null
}

/**
 * 将用户信息保存到 localStorage
 */
function saveUserToStorage(user: SafeUser | null): void {
    if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
        localStorage.removeItem(STORAGE_KEY)
    }
}

// ==================== Module ====================

const userModule: Module<UserState, any> = {
    namespaced: true,

    state: (): UserState => ({
        currentUser: loadUserFromStorage(),
        loading: false,
    }),

    getters: {
        /** 是否已登录 */
        isLoggedIn(state): boolean {
            return state.currentUser !== null
        },
        /** 当前用户 ID */
        userId(state): number | null {
            return state.currentUser?.id ?? null
        },
        /** 当前用户昵称 */
        nickname(state): string {
            return state.currentUser?.nickname || state.currentUser?.username || ''
        },
        /** 当前主题 */
        theme(state): string {
            return state.currentUser?.theme || 'light'
        },
        /** 获取当前用户信息 */
        currentUser(state): SafeUser | null {
            return state.currentUser
        },
    },

    mutations: {
        SET_USER(state, user: SafeUser | null) {
            state.currentUser = user
            saveUserToStorage(user)
        },
        SET_LOADING(state, loading: boolean) {
            state.loading = loading
        },
        UPDATE_USER_INFO(state, updates: Partial<SafeUser>) {
            if (state.currentUser) {
                state.currentUser = { ...state.currentUser, ...updates }
            }
            // 更新 state 后保存到 storage
            saveUserToStorage(state.currentUser)
        },
    },

    actions: {
        /**
         * 重新拉取用户信息
         */
        async fetchUserInfo({ state, commit }) {
            if (!state.currentUser) return
            try {
                const user = await userApi.getById(state.currentUser.id)
                if (user) {
                    commit('UPDATE_USER_INFO', user)
                }
            } catch (e) {
                console.error('Failed to fetch user info', e)
            }
        },
        /**
         * 用户登录
         */
        async login({ commit }, params: { username: string; password: string }): Promise<AuthResponse> {
            commit('SET_LOADING', true)
            try {
                const result = await authApi.login(params)
                if (result.success && result.user) {
                    commit('SET_USER', result.user)
                }
                return result
            } finally {
                commit('SET_LOADING', false)
            }
        },

        /**
         * 用户注册
         */
        async register({ commit }, params: { username: string; password: string; nickname?: string }): Promise<AuthResponse> {
            commit('SET_LOADING', true)
            try {
                const result = await authApi.register(params)
                if (result.success && result.user) {
                    commit('SET_USER', result.user)
                }
                return result
            } finally {
                commit('SET_LOADING', false)
            }
        },

        /**
         * 退出登录
         */
        logout({ commit }) {
            commit('SET_USER', null)
        },

        /**
         * 更新用户信息（如昵称、主题等）
         */
        async updateProfile({ state, commit }, params: { nickname?: string; avatar?: string; theme?: string }): Promise<boolean> {
            if (!state.currentUser) return false
            const success = await userApi.update(state.currentUser.id, params)
            if (success) {
                commit('UPDATE_USER_INFO', params)
            }
            return success
        },
    },
}

export default userModule
