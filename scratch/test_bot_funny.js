
function getFoodFunnyProgress(status, name = "") {
    const nameSuffix = name ? `, ${name}` : "";
    const quips = {
        "Preparing": [
            `Our chef is currently whispering sweet nothings to your dough to make it extra fluffy${nameSuffix}. 👨‍🍳`,
            `Ingredients are being introduced to each other. It's a very romantic kitchen session${nameSuffix}. 🥣`,
            `We're making sure your pizza is more circular than the wheels on a delivery bike${nameSuffix}! 🍕`
        ],
        "Cooked": [
            `Your food is currently in its final photo shoot${nameSuffix}. It's looking delicious and ready to travel! 📸`,
            `It's hot, it's fresh, and it's currently being tucked into its box for a cozy ride${nameSuffix}. 🍱`,
            `Smelling so good even the neighboring building is jealous! Almost ready${nameSuffix}! 🍱`
        ],
        "Out for Delivery": [
            `Our delivery hero is moving faster than a pizza falling off a table${nameSuffix}! Keep the napkins ready. 🚀`,
            `Escape plan successful! Your food has left the kitchen and is racing to your doorstep${nameSuffix}. 🛵`,
            `The bike is fueled, the box is hot, and the hunger games are almost over${nameSuffix}! 🚀`
        ]
    };
    return quips[status] ? quips[status][0] : "N/A";
}

console.log("Testing with name 'Rahul':");
console.log(getFoodFunnyProgress("Preparing", "Rahul"));
console.log("Testing with empty name:");
console.log(getFoodFunnyProgress("Preparing", ""));
