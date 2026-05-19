import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    type User,
    type Unsubscribe,
} from "firebase/auth";
import { create } from "zustand";
import { auth } from "../../firebase.config";

type AuthStore = {
    userLogged: User | null;
    initAuthObserver: () => Unsubscribe;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
};

const useAuthStore = create<AuthStore>((set) => ({
    userLogged: null,
    initAuthObserver: () => {
        return onAuthStateChanged(auth, (user) => {
            user ? set({ userLogged: user }) : set({ userLogged: null });
        });
        //user ? set({ userLogged: user }) : set({ userLogged: null })
        // operador ternario, azucar sintactico, es una forma mas corta de escribir un if else
    },
    loginWithGoogle: async () => {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        set({ userLogged: result.user });
    },
    logout: async () => {
        await signOut(auth)
            .then(() => {
                set({ userLogged: null });
            })
            .catch((error: unknown) => {
                console.log(error);
            });
    },
}));

export default useAuthStore;
