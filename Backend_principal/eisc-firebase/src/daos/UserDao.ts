import {
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../../firebase.config";

export type UserData = {
    uid: string;
    name: string | null;
    email: string | null;
};

type DaoResponse<T> = {
    success: boolean;
    data?: T | null;
    error?: unknown;
};

class UserDao {
    private collectionName = "users";

    private userRef(uid: string) {
        return doc(db, this.collectionName, uid);
    }

    async getUserById(uid: string): Promise<DaoResponse<DocumentData>> {
        try {
            const userDoc = await getDoc(this.userRef(uid));

            if (userDoc.exists()) {
                return { success: true, data: userDoc.data() };
            }

            return { success: false, data: null };
        } catch (error) {
            console.log("Error getting document:", error);
            return { success: false, error };
        }
    }

    async createUser(userData: UserData): Promise<DaoResponse<{ id: string }>> {
        try {
            await setDoc(this.userRef(userData.uid), userData, { merge: true });
            return { success: true, data: { id: userData.uid } };
        } catch (error) {
            console.error("Error writing document: ", error);
            return { success: false, error };
        }
    }

    async updateUser(uid: string, userData: Partial<UserData>): Promise<DaoResponse<null>> {
        try {
            await updateDoc(this.userRef(uid), userData);
            return { success: true, data: null };
        } catch (error) {
            console.error("Error updating document: ", error);
            return { success: false, error };
        }
    }

    async deleteUser(uid: string): Promise<DaoResponse<null>> {
        try {
            await deleteDoc(this.userRef(uid));
            return { success: true, data: null };
        } catch (error) {
            console.error("Error removing document:", error);
            return { success: false, error };
        }
    }
}

export default new UserDao();