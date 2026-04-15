const fetch = require('node-fetch');

const API_KEY = "AIzaSyAAHuSGwulRO3QhrOD4zK3ZRISivBi7jOM";
const users = [
    { email: "roshanipizza@gmail.com", password: "12345678" },
    { email: "roshanicakes@gmail.com", password: "12345678" },
    { email: "ravi@rider.com", password: "12345678" },
    { email: "suman@rider.com", password: "12345678" }
];

async function registerUsers() {
    for (const user of users) {
        console.log(`Checking/Registering user: ${user.email}...`);
        try {
            const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
                method: "POST",
                body: JSON.stringify({
                    email: user.email,
                    password: user.password,
                    returnSecureToken: true
                }),
                headers: { "Content-Type": "application/json" }
            });
            const data = await res.json();
            if (data.error) {
                if (data.error.message === "EMAIL_EXISTS") {
                    console.log(`User ${user.email} already exists.`);
                } else {
                    console.error(`Error for ${user.email}:`, data.error.message);
                }
            } else {
                console.log(`User ${user.email} created successfully.`);
            }
        } catch (err) {
            console.error(`Fetch error for ${user.email}:`, err);
        }
    }
}

registerUsers();
