
require('dotenv').config();
const express = require('express');


const path = require('path');
const multer = require('multer');

const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors({
    origin: ['http://localhost:5173',
        'http://localhost:5174',
        'http://kawan-one.vercel.app',
        'https://kawan-assist.web.app',
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// ---- JWT cookie auth (used by kawan-admin / FoodLink) ----
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
};

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.user = decoded;
        next();
    });
};

app.post('/jwt', (req, res) => {
    const { email } = req.body || {};
    if (!email) {
        return res.status(400).send({ message: 'email is required' });
    }
    const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
    res.cookie('token', token, cookieOptions).send({ success: true });
});

app.post('/logout', (req, res) => {
    res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).send({ success: true });
});


// Set MONGODB_URI in .env to use a different Atlas cluster; otherwise the original cluster is used.
const uri = process.env.MONGODB_URI ||
    `mongodb+srv://${encodeURIComponent(process.env.DB_USER || '')}:${encodeURIComponent(process.env.DB_PASS || '')}@cluster0.tdfgd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


const UPLOAD_FOLDER = "./uploads";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_FOLDER);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const fileName = file.originalname
            .replace(ext, "")
            .toLowerCase()
            .split(" ")
            .join("-") + "-" + Date.now();
        cb(null, fileName + ext);
    }
});

const upload = multer({
    storage: storage,
});



async function run() {
    try {
        try {
            await client.connect();
            await client.db('admin').command({ ping: 1 });
            console.log('Connected to MongoDB');
        } catch (err) {
            console.error(`MongoDB connection failed (${err.code || err.name}): ${err.message}`);
            if (err.code === 'ENOTFOUND') {
                console.error('The cluster hostname does not exist. Set MONGODB_URI in .env to a valid connection string.');
            }
        }

        const professionalsCollection = client.db('kawanDB').collection('professionals');
        const contactCollection = client.db('kawanDB').collection('contact');
        const coinCollection = client.db('kawanDB').collection('coin');
        const verifyRequestCollection = client.db('kawanDB').collection('verify-request');
        const verifiedCollection = client.db('kawanDB').collection('verified-professionals');
        const reqCounsellingCollection = client.db('kawanDB').collection('req-counselling');
        const acceptCounsellingCollection = client.db('kawanDB').collection('acc-counselling');
        const allDoneCounsellingCollection = client.db('kawanDB').collection('all-counselling');

        const foodCollection = client.db('kawanDB').collection('foods');
        const requestedFoodCollection = client.db('kawanDB').collection('requestedFoods');

        // ---- FoodLink (kawan-admin) food routes ----
        app.get('/food', async (req, res) => {
            try {
                const result = await foodCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch foods' });
            }
        });

        app.post('/food', verifyToken, async (req, res) => {
            const newFood = req.body || {};
            if (req.user.email !== newFood.donatorEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            try {
                const result = await foodCollection.insertOne({ status: 'available', ...newFood });
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to add food' });
            }
        });

        app.get('/food/:id', async (req, res) => {
            if (!ObjectId.isValid(req.params.id)) {
                return res.status(400).send({ message: 'Invalid food id' });
            }
            try {
                const result = await foodCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!result) {
                    return res.status(404).send({ message: 'Food not found' });
                }
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch food' });
            }
        });


        app.get('/verify-professionals-list', async (req, res) => {
            const cursor = verifiedCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        

        app.delete('/professionals-manage/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };  // Use email directly as a string, no need for ObjectId
            try {
                const result = await verifiedCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting item", error });
            }
        });


        app.post('/professionals-manage', async (req, res) => {
            try {
                const verifyReq = req.body;
                // Insert the verified professional into the 'verifiedCollection' database collection
                const result = await verifiedCollection.insertOne(verifyReq);
                
                if (result.acknowledged) {
                    res.status(200).send({ message: 'Professional accepted and stored successfully', result });
                } else {
                    res.status(500).send({ message: 'Failed to store professional data' });
                }
            } catch (error) {
                console.error("Error inserting data:", error);
                res.status(500).send({ message: 'Error storing professional data' });
            }
        }); 
        
        

        app.get('/req-professionals', async (req, res) => {
            const cursor = verifyRequestCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/contact', async (req, res) => {
            const cursor = contactCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })


        app.delete('/contact/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };  // Use email directly as a string, no need for ObjectId
            try {
                const result = await contactCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting item", error });
            }
        });


        app.delete('/req-professionals/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };  // Use email directly as a string, no need for ObjectId
            try {
                const result = await verifyRequestCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting item", error });
            }
        });



        app.post('/professionals', async (req, res) => {
            const newProfessional = req.body;
            const result = await professionalsCollection.insertOne(newProfessional);
            res.send(result);
        })

        
        app.post('/req-counselling', async (req, res) => {
            const counselling = req.body;
            const result = await reqCounsellingCollection.insertOne(counselling);
            res.send(result);
        })

        
        app.post('/live', async (req, res) => {
            const counselling = req.body;
            const result = await acceptCounsellingCollection.insertOne(counselling);
            res.send(result);
        })


        app.get('/live-details-user/:email', async (req, res) => {
            const userEmail = req.params.email;
            console.log(`Fetching counselling requests for: ${userEmail}`);  // Add logging here
            try {
                const counselling = await acceptCounsellingCollection.find({ userEmail }).toArray();
                if (counselling.length === 0) {
                    console.log('No counselling requests found for this professional');
                }
                res.json(counselling);
            } catch (error) {
                console.error('Error fetching counselling requests:', error);
                res.status(500).json({ error: 'Failed to fetch counselling requests' });
            }
        });

        app.get('/live-details-professor/:email', async (req, res) => {
            const professionalEmail = req.params.email;
            console.log(`Fetching counselling requests for: ${professionalEmail}`);  // Add logging here
            try {
                const counselling = await acceptCounsellingCollection.find({ professionalEmail }).toArray();
                if (counselling.length === 0) {
                    console.log('No counselling requests found for this professional');
                }
                res.json(counselling);
            } catch (error) {
                console.error('Error fetching counselling requests:', error);
                res.status(500).json({ error: 'Failed to fetch counselling requests' });
            }
        });

        app.get('/req-live-u/:email', async (req, res) => {
            const userEmail = req.params.email;
            console.log(`Fetching counselling requests for: ${userEmail}`);  // Add logging here
            try {
                const counselling = await reqCounsellingCollection.find({ userEmail }).toArray();
                if (counselling.length === 0) {
                    console.log('No counselling requests found for this professional');
                }
                res.json(counselling);
            } catch (error) {
                console.error('Error fetching counselling requests:', error);
                res.status(500).json({ error: 'Failed to fetch counselling requests' });
            }
        });

        // just for not approving 2 counseling at a time
        app.get('/req-live-uss/:email', async (req, res) => {
            const professionalEmail = req.params.email;
            console.log(`Fetching counselling requests for: ${professionalEmail}`);  // Add logging here
            try {
                const counselling = await reqCounsellingCollection.find({ professionalEmail }).toArray();
                if (counselling.length === 0) {
                    console.log('No counselling requests found for this professional');
                }
                res.json(counselling);
            } catch (error) {
                console.error('Error fetching counselling requests:', error);
                res.status(500).json({ error: 'Failed to fetch counselling requests' });
            }
        });


       

        app.delete('/req-live-delete/:email', async (req, res) => {
            const professionalEmail = req.params.email;
            const userEmail = req.query.userEmail; // Extract userEmail from query parameters

            console.log(professionalEmail, userEmail);
        
            if (!userEmail) {
                return res.status(400).send({ message: "User email is required" });
            }
        
            const query = {
                professionalEmail: professionalEmail,
                userEmail: userEmail
            };
        
            try {
                const result = await reqCounsellingCollection.deleteOne(query);
        
                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "No matching counseling request found." });
                }
        
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting item", error });
            }
        });
        
        


        app.get('/req-live-p/:email', async (req, res) => {
            const professionalEmail = req.params.email;
            console.log(`Fetching counselling requests for: ${professionalEmail}`);  // Add logging here
            try {
                const counselling = await reqCounsellingCollection.find({ professionalEmail }).toArray();
                if (counselling.length === 0) {
                    console.log('No counselling requests found for this professional');
                }
                res.json(counselling);
            } catch (error) {
                console.error('Error fetching counselling requests:', error);
                res.status(500).json({ error: 'Failed to fetch counselling requests' });
            }
        });

        app.delete('/req-live-pr/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };  // Use email directly as a string, no need for ObjectId
            try {
                const result = await verifyRequestCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Error deleting item", error });
            }
        });
        

        app.post('/professionals-verify-request', async (req, res) => {
            const verifyReq = req.body;
            const result = await verifyRequestCollection.insertOne(verifyReq);
            res.send(result);
        })

        app.post('/contact', async (req, res) => {
            const contact = req.body;
            const result = await contactCollection.insertOne(contact);
            res.send(result);
        })

        app.post('/coin', async (req, res) => {
            const coin = req.body;
            const result = await coinCollection.insertOne(coin);
            res.send(result);
        })

        app.get('/professionals/:email', async (req, res) => {
            const email = req.params.email; // Extract email from the route parameter
            const query = { email }; // Use shorthand for email in the query

            try {
                const result = await professionalsCollection.findOne(query); // Query the collection

                if (result) {
                    // Check if the professional is verified
                    if (result.isVerify) {
                        return res.status(200).send({ status: 2, message: 'Verified professional' }); // Verified
                    } else {
                        return res.status(200).send({ status: 1, message: 'Unverified professional' }); // Unverified
                    }
                }

                // No matching professional found
                res.status(404).send({ status: 0, message: 'Professional not found' });

            } catch (error) {
                console.error('Error fetching professional:', error); // Log any errors for debugging
                res.status(500).send({ message: 'Internal server error', error: error.message }); // Send server error response
            }
        });

        app.get('/check-verify-req/:email', async (req, res) => {
            const email = req.params.email; // Extract email from the route parameter
            const query = { email }; // Use shorthand for email in the query

            try {
                const result = await verifyRequestCollection.findOne(query); // Query the collection

                if (result) {

                    return res.status(200).send({ status: 1, message: 'Verified professional' });
                } else {
                    return res.status(200).send({ status: 0, message: 'Unverified professional' });
                }

                res.status(404).send({ status: 0, message: 'Professional not found' });
            } catch (error) {
                console.error('Error fetching professional:', error);
                res.status(500).send({ message: 'Internal server error', error: error.message });
            }
        });

        app.put('/accept-professionals/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };  // Query directly by email string
            const options = { upsert: true };
        
            const professionalUpdate = {
                $set: {
                    isVerify: true,
                }
            };
            
            try {
                const result = await professionalsCollection.updateOne(filter, professionalUpdate, options);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: 'Failed to update professional status' });
            }
        });        



        app.put('/delete-professionals/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };  // Query directly by email string
            const options = { upsert: true };
        
            const professionalUpdate = {
                $set: {
                    isVerify: false,
                }
            };
            
            try {
                const result = await professionalsCollection.updateOne(filter, professionalUpdate, options);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: 'Failed to update professional status' });
            }
        });     


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

            if (!ObjectId.isValid(foodId)) {
                return res.status(400).send({ message: 'Invalid food id' });
            }

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
            try {
                const result = await foodCollection.find({ status: "available" }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch available foods' });
            }
        })





        app.put('/food/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ message: 'Invalid food id' });
            }
            const filter = { _id: new ObjectId(id), donatorEmail: req.user.email };
            const options = {};
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






        app.delete('/food/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ message: 'Invalid food id' });
            }
            try {
                // Only the donator can delete their own food
                const result = await foodCollection.deleteOne({ _id: new ObjectId(id), donatorEmail: req.user.email });
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to delete food' });
            }
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

// Keep the server alive if a DB operation fails outside a request handler
process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err?.message || err);
});


app.get('/', (req, res) => {
    res.send('kawan server is running');
})

app.listen(port, () => {
    //console.log(`movie server is running at PORT: ${port}`);
})