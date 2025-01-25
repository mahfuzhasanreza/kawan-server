
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors({
    origin: ['http://localhost:5173',
        'https://email-password-auth-70ed7.web.app',
        'https://email-password-auth-70ed7.firebaseapp.com'
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.g0bvt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'unAuthorized access' })
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded;
        next();
    })

}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const foodCollection = client.db('foodDB').collection('food');
        const requestedFoodCollection = client.db('foodDB').collection('requestedFoods');

        // Auth related APIs
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
                })
                .send({ success: true })

        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            })
                .send({ success: true })
        })

        app.post('/request-food', async (req, res) => {
            const {
                foodId,
                foodName,
                foodImage,
                donatorEmail,
                donatorName,
                userEmail,
                requestDate,
                pickupLocation,
                expiredDateTime,
                additionalNotes,
            } = req.body;

            try {
                // Find the food item to ensure it exists and is not already requested
                const food = await foodCollection.findOne({ _id: new ObjectId(foodId) });

                if (!food) {
                    return res.status(404).send({ message: 'Food item not found' });
                }

                if (food.status === 'requested') {
                    return res.status(409).send({ message: 'This food item has already been requested' });
                }

                // Add the food to the requestedFoods collection
                const requestedFood = {
                    foodId,
                    foodName,
                    foodImage,
                    donatorEmail,
                    donatorName,
                    userEmail,
                    requestDate,
                    pickupLocation,
                    expiredDateTime,
                    additionalNotes,
                    status: 'requested',
                };

                const insertResult = await requestedFoodCollection.insertOne(requestedFood);

                // Update the status of the food in the available food collection
                const updateResult = await foodCollection.updateOne(
                    { _id: new ObjectId(foodId) },
                    { $set: { status: 'requested' } }
                );

                if (insertResult.insertedId && updateResult.modifiedCount > 0) {
                    res.status(201).send({ message: 'Food successfully requested', insertId: insertResult.insertedId });
                } else {
                    res.status(500).send({ message: 'Failed to request food' });
                }
            } catch (error) {
              //  console.error('Error requesting food:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });


        // Endpoint to get food requests by user email
        app.get('/food-requests', verifyToken, async (req, res) => {
            const userEmail = req.query.userEmail;

            if (!userEmail) {
                return res.status(400).json({ error: 'User email is required' });
            }

            if (req.user.email !== userEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            try {
                // Fetch food requests from the foodRequests collection by user email
                const foodRequests = await requestedFoodCollection.find({ userEmail }).toArray();
                res.json(foodRequests);
            } catch (error) {
              //  console.error('Error fetching food requests:', error);
                res.status(500).json({ error: 'Failed to fetch food requests' });
            }
        });




        app.get('/available-foods', async (req, res) => {
            const query = { status: "available" }
            const cursor = foodCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/food', async (req, res) => {
            const cursor = foodCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/food/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await foodCollection.findOne(query);
            res.send(result);
        })
        


        app.put('/food/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedFood = req.body;



            const foodUpdate = {
                $set: {
                    foodName: updatedFood.foodName,
                    foodImage: updatedFood.foodImage,
                    foodQuantity: updatedFood.foodQuantity,
                    pickupLocation: updatedFood.pickupLocation,
                    expiredDateTime: updatedFood.expiredDateTime,
                    additionalNotes: updatedFood.additionalNotes,
                    donatorImage: updatedFood.donatorImage,
                    donatorName: updatedFood.donatorName,
                    donatorEmail: updatedFood.donatorEmail,
                    status: updatedFood.status,
                }
            };

            try {
                const result = await foodCollection.updateOne(filter, foodUpdate, options);
                res.send(result);
            } catch (error) {
             //   console.error(error);
                res.status(500).send({ error: 'Failed to update food' });
            }
        });



        app.post('/food', verifyToken, async (req, res) => {
            const newFood = req.body;
            // console.log(newFood);

            const result = await foodCollection.insertOne(newFood);
            res.send(result);
        })


        app.delete('/food/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }


            const result = await foodCollection.deleteOne(query);
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        //console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('kawan server is running');
})

app.listen(port, () => {
    //console.log(`movie server is running at PORT: ${port}`);
})