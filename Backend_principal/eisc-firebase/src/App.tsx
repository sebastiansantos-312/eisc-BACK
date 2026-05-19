import { useEffect } from "react";
import "./App.css";
import useAuthStore from "./stores/useAuthStore";

function App() {
    const { initAuthObserver, loginWithGoogle } = useAuthStore();

    useEffect(() => {
        const unsubscribe = initAuthObserver();
        return unsubscribe;
    }, [initAuthObserver]);


    return (
        <div className="container">
            <div className="card">
                <h1>Iniciar sesion con</h1>
                <button className="login" onClick={() => loginWithGoogle()}>
                    Google
                </button>
            </div>
        </div>
    );
}

export default App;
