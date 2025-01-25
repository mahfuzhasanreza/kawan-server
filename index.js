
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
        'http://kawan-one.vercel.app',
        'https://kawan-assist.web.app',
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdfgd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const professionalsCollection = client.db('kawanDB').collection('professionals');
        const requestedFoodCollection = client.db('kawanDB').collection('requestedFoods');

        app.post('/professionals', async (req, res) => {
            const newProfessional = req.body;
            const result = await professionalsCollection.insertOne(newProfessional);
            res.send(result);
        })

        app.get('/professional/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: new ObjectId(email) }
            const result = await foodCollection.findOne(query);
            res.send(result);
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
        app.get('/food-requests', async (req, res) => {
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

        
        


        app.put('/food/:id', async (req, res) => {
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



        


        app.delete('/food/:id', async (req, res) => {
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