import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import couchbase, { Bucket, Collection, GetResult, MutationResult } from "couchbase";
import { v4 as uuidv4 } from "uuid";

const typeDefs = `#graphql
    type Product {
        name: String
        price: Float
        quantity: Int
        tags: [String]
    }

    input ProductInput {
        name: String
        price: Float
        quantity: Int
        tags: [String]
    }

    type Query {
        getProduct(id: String): Product
        getAllProductsWithTerm(term: String): [ Product ]
    }

    type Mutation {
        createProduct(product: ProductInput): Product
        deleteProduct(id: String): Boolean
        updateProduct(id: String, product: ProductInput): Product
        setQuantity(id: String, quantity: Int): Boolean
    }
`

/*
    Mutation -> changes data (deleting, creating the data, changing just one property)
    X createProduct
    X deleteProduct
    X updateProduct

    // "typescript" -> { "typescript book", "typescript video" }

    Bonus:
    X getAllProductsWithTerm - Full Text Search within Couchbase to easily search documents
    _ setQuantity            - Use Couchbase to edit just one property in a document
*/

const resolvers = {
    Query: {
        async getProduct( _, args, contextValue) { // Apollo Server has 4 parameters-> (parent, args, contextValue, info)
            // args : { id: "1" }, contexValue : { couchbaseCluster: Cluster }
            const { id } = args; // id: "1"  object destructuring

            const bucket: Bucket = contextValue.couchbaseCluster.bucket('store-bucket');
            const collection: Collection = bucket.scope('products-scope').collection('products');
            
            const getResult: GetResult = await collection.get(id).catch( (error) => {
                console.log(error);
                throw error; // "Document not found"
            });

            return getResult.content;
        },
        async getAllProductsWithTerm( _, args, contextValue) { 
            // search index -> 
            // "product-index" -> products collection
            const { term } = args; // "typescript"

            // searches happen at the cluster level

            const result = await contextValue.couchbaseCluster.searchQuery(
                "index-products",
                couchbase.SearchQuery.match(term),
                {
                    limit: 2
                }
            )
            
            // result.rows -> [ { id: "" }  ]

            const bucket: Bucket = contextValue.couchbaseCluster.bucket('store-bucket');
            const collection: Collection = bucket.scope('products-scope').collection('products');
            
            var productsArray = [];

            for (var i = 0; i < result.rows.length; i++) {
                const id = result.rows[i].id;
                const getResult : GetResult = await collection.get(id).catch( (error) => {
                    console.log(error);
                    throw error; // "Document not found"
                });

                productsArray.push(getResult.content);
            }
            
            return productsArray;
        }
    },
    Mutation: {
        async createProduct( _, args, contextValue) {
            const { product } = args; // product: { name: "Cooper", ... }  object destructuring

            const bucket: Bucket = contextValue.couchbaseCluster.bucket('store-bucket');
            const collection: Collection = bucket.scope('products-scope').collection('products');

            // insert(key, value) -> "1", product
            // we want to create unique IDs
            // UUID (Universal Unique Identifier) npm uuid 
            // uuidv4() -> "3200f132-5b39-4ff7-bf9b-cb5008aac45d" <- they will never be the same twice

            const key = uuidv4(); // key: "3200f132-5b39-4ff7-bf9b-cb5008aac45d"

            const createdMutationResult: MutationResult = await collection.insert(key, product).catch((error) => {
                console.log(error);
                throw error; // "Document not found"
            });

            return product;
        },
        async deleteProduct( _, args, contextValue) {
            const { id } = args; // id: "1" object destructuring

            const bucket: Bucket = contextValue.couchbaseCluster.bucket('store-bucket');
            const collection: Collection = bucket.scope('products-scope').collection('products');

            const deletedMutationResult: MutationResult = await collection.remove(id).catch((error) => {
                console.log(error);
                throw error; // "Document not found"
            });

            return true;
        },
        async updateProduct( _, args, contextValue) {
            const { id, product } = args; // args: { id: "1", product: { product object } }

            const bucket: Bucket = contextValue.couchbaseCluster.bucket('store-bucket');
            const collection: Collection = bucket.scope('products-scope').collection('products');

            const updatedMutationResult: MutationResult = await collection.replace(id, product).catch((error) => {
                console.log(error);
                throw error; // "Document not found"
            });

            return product;
        },
        async setQuantity( _, args, contextValue) {
            // args: id and quantity
            const { id, quantity } = args;

            const bucket: Bucket = contextValue.couchbaseCluster.bucket('store-bucket');
            const collection: Collection = bucket.scope('products-scope').collection('products');

            const updatedMutationResult: MutationResult = await collection.mutateIn(id, 
                [
                    couchbase.MutateInSpec.replace("quantity", quantity)
                ]    
            ).catch((error) => {
                console.log(error);
                throw error; // "Document not found"
            });

            return true;
        }
    }
}

const server = new ApolloServer({
    typeDefs, // typeDefs -> Defining our GraphQL Types (Product, Query, Mutation)
    resolvers // resolvers -> To create logic for certain GraphQL Types (Query, Mutation)
    // Query -> getProduct(id: String) -> inside of resolvers we define the logic for... grab item from db
});

// User inputs
const clusterConnStr = "couchbases://cb.ttvjc3zenxr155by.cloud.couchbase.com"; // Replace this with Connection String
const username = "coopercodes"; // Replace this with username from database access credentials
const password = "Coopercodes123!"; // Replace this with password from database access credentials

const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
    context: async ({ req, res }) => ({
        couchbaseCluster: await couchbase.connect(clusterConnStr, {
            username: username,
            password: password,
            // Use the pre-configured profile below to avoid latency issues with your connection.
            configProfile: "wanDevelopment",
        })
    })
    // inside of our API routes -> context.couchbaseCluster 
});

console.log("Server running on " + url);
