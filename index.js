import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import session from 'express-session';
import stringSimilarity from 'string-similarity';
import { dirname,join } from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "bookNotes",
  password: "12345",
  port: 5432,
});
db.connect();

// Initialize express-session to allow us to track the logged-in user
app.use(session({
  secret: 'your-secret-key', 
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // Set the session duration
}));

let books = [ ];
// for fetching top 3 books according to rating
async function findTop3(){
  const result = await db.query(
    // "select * from books order by rating desc,book_name limit 3"
    "SELECT books.*, authors.author_name FROM books JOIN authors ON books.author_id = authors.id ORDER BY rating DESC, book_name LIMIT 3"
  );

  (result.rows).forEach(book => {
    book.date_read = convert(book.date_read);
  });
    return result.rows;
}

async function findAll(){
  const result = await db.query(
    "select books.*, authors.author_name FROM books JOIN authors ON books.author_id = authors.id order by date_read desc, book_name"
  );
    (result.rows).forEach(book => {
      book.date_read = convert(book.date_read);
    });
    return result.rows;
}

function convert(str) {
  var date = new Date(str),
    mnth = ("0" + (date.getMonth() + 1)).slice(-2),
    day = ("0" + date.getDate()).slice(-2);
  return [date.getFullYear(), mnth, day].join("-");
}

function isAuthenticated(req){
  if(req.session.user){
    return true;
  }
  else{
    return false;
  }
}


// function to retreive image and other book data from open library api
async function getBooks(value) {
  try {
      const response = await fetch(`http://openlibrary.org/search.json?q=${value}`);
      const data = await response.json();

      if (data.docs && data.docs.length > 0) {
          // Return the first 5 books as an array of objects
          return data.docs.slice(0, 10).map(book => {
              return {
                  title: book.title,
                  author: book.author_name ? book.author_name[0] : 'Unknown',
                  coverUrl: book.oclc ? `http://covers.openlibrary.org/b/oclc/${book.oclc[0]}-M.jpg?default=false` : '',
                  oclc: book.oclc ? book.oclc:'',
                };
          });
      } else {
          console.log('No books found.');
          return [];
      }
  } catch (error) {
      console.error('Error fetching books:', error);
      return [];
  }
}

// Function to check if the Open Library cover exists or if it's blank
async function checkIfOpenLibraryCoverExists(url) {
  try {
    const response = await axios.head(url);
    return response.status === 200 && response.headers['content-type'].startsWith('image');
  } catch (error) {
    return false;
  }
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
//app.use(express.static(join(__dirname, 'public')));


app.get("/", async (req, res) => {

  const top3books = await findTop3();
  books = await findAll();
  
    try{
      // console.log(top3books);
      // console.log(books);
      
      if(isAuthenticated(req)){
        const username = req.session.user.username;
        res.render("index.ejs",{
          username:username,
          top3books:top3books,
          allBooks:books
        });
      }
      else{
        res.render("index.ejs",{
          top3books:top3books,
          allBooks:books
        });
      }

      
    }
    catch(e){
      console.log("Error fetching items from database!")
      console.log(e);
    }
  });

  
  // faced a major problem here
  // first, to send details of specific book to readMore.ejs i had to send it using params
  // updating /readMore to readMore/<%= book.id %> in ejs file
  // and /read1m1ore/:id as endpoint here

  //second,css was applying to /readMore but not readMore/:id so changed path to root
  // from styles\readMore.css to \styles\readMore.css and checked express.static("public")
  app.get("/readMore/:id", async (req, res) => {
    try{
      // Find the book with the specified ID
      const bookId = parseInt(req.params.id);
      const selectedBook = books.find(book => book.id === bookId);

       // Check if the user is logged in and has a username in the session
      const username = req.session.user ? req.session.user.username : null;
      // Render the readMore.ejs file and pass the specific book data
      res.render('readMore.ejs', { book: selectedBook,username });
          
    }
    catch(e){
      console.log("Error fetching items from database!")
      console.log(e);
    }
  });

  app.get("/login", async (req, res) => {

      try{ 
        res.render("login.ejs");
      }
      catch(e){
        console.log("Error! Can't Login!")
        console.log(e);
      }
    });

    app.get("/register", async (req, res) => {

      try{ 
        res.render("register.ejs");
      }
      catch(e){
        console.log("Error! Can't Register!")
        console.log(e);
      }
    });

    app.post("/register",async(req,res) =>{
      try{
        const username = req.body["username"];
        const email = req.body["email"];
        const password = req.body["password"];

        const result = await db.query(
          "insert into users(username,email,password) values ($1,$2,$3)",[username,email,password]
        );

        res.redirect("/login");

      }
      catch(error){
        console.log("Error adding user :",error);
      }
    })


    app.post("/login",async(req,res) =>{
      try{
        const username = req.body["username"];
        const password = req.body["password"];

        const result = await db.query(
          "select * from users where username = $1 and password = $2",[username,password]
        );

        if(result.rows.length == 1){
          req.session.user = result.rows[0];
          res.redirect("/");
          // also add other info of user to display in home page
        }
        else{
          res.redirect("/login");
        }


      }
      catch(error){
        console.log("Error adding user :",error);
      }
    })

    app.get("/profile",async(req,res) =>{
      try{

        if(isAuthenticated(req)){
          const username = req.session.user ? req.session.user.username : null;
          res.render("profile.ejs",{
            username,
            user: req.session.user
          });
        }
        else{
          res.redirect("/");
        }


      }
      catch(error){
        console.log("Error adding user :",error);
      }
    })


    // Add new book endpoint

    app.get("/add", async(req,res) => {
      try{
         // Check if the user is logged in and has a username in the session
        const username = req.session.user ? req.session.user.username : null;
        res.render("./partials/add.ejs",{
          username
        });
      }
      catch(e){
        console.log("Error going to /add :",error);
      }
    })

    // add new book to database

    app.post("/add", async (req, res) => {
      try {
        const { newBook, date_read, book_notes, book_summary, author } = req.body;
        const rate = parseInt(req.body.rate);
    
        const books = await getBooks(newBook);
        console.log('Books:\n', books);
    
        const relativePath = join('assets', 'images', 'defaultBookCover.jpeg');
        let coverUrl = relativePath.replace(/\\/g, '/');
    
        if (books.length > 0) {
          // Check if there is a similar match in both book name and author name
          let bestMatch = null;
          let bestMatchRating = -1;

          const titleMatches = stringSimilarity.findBestMatch(newBook, books.map(book => book.title)).ratings;
          const authorMatches = stringSimilarity.findBestMatch(author, books.map(book => book.author)).ratings;
          console.log("titleMatches: ",titleMatches);
          console.log("authorMatches: ",authorMatches);
          for(var i=0;i<titleMatches.length;i++){
            const combinedAvgRating = (titleMatches[i].rating + authorMatches[i].rating) / 2;

            if (combinedAvgRating > 0.5 && combinedAvgRating > bestMatchRating) {
              bestMatch = books[i];
              bestMatchRating = combinedAvgRating;
            }
          }
        
          console.log(bestMatch);
          if (bestMatch ) {
            //const matchedBook = books.find(book => book.title === bestTitleMatch.target && book.author === bestAuthorMatch.target);
            const matchedBook =bestMatch;
            let isCoverAvailable = false;
            console.log("matchedBook : ", matchedBook);

            if (matchedBook && matchedBook.coverUrl ) {
              for(const oclcValue of matchedBook.oclc){
                const oclcCoverUrl = `http://covers.openlibrary.org/b/oclc/${oclcValue}-M.jpg?default=false`;
                isCoverAvailable = await checkIfOpenLibraryCoverExists(oclcCoverUrl)
                if(isCoverAvailable){
                  coverUrl = oclcCoverUrl;
                  break;
                }
              }
              console.log("matchedBook.coverUrl : ", coverUrl);
            } 
            
            else {
              //isCoverAvailable = await checkIfOpenLibraryCoverExists(matchedBook.coverUrl);
    
                const key = 'title';
                const value = encodeURIComponent(matchedBook.title);
                const size = 'M';
                coverUrl = `https://covers.openlibrary.org/b/${key}/${value}-${size}.jpg`;
                console.log(coverUrl);
    
                isCoverAvailable = await checkIfOpenLibraryCoverExists(coverUrl);
    
                coverUrl = isCoverAvailable ? coverUrl : '/assets/images/defaultBookCover.jpeg';
              
            }
          }
        }
        console.log("selected cover - ",coverUrl);
    
        let author_id;
        
        const authorFetched = await db.query(
          "select id from authors where LOWER(author_name) like $1 ",['%' + author.trim().toLowerCase() + '%']
        );

      
        if (authorFetched.rows.length === 1) {
          author_id = parseInt(authorFetched.rows[0].id);
        } else {
          console.log("Unable to fetch author id for author : ", author);
          const result = await db.query("insert into authors (author_name)  values($1) returning id", [author]);
          author_id = parseInt(result.rows[0].id);
        }
    
        await db.query("Insert into books (book_name,author_id,date_read,rating,book_summary,book_cover,about_book) values($1,$2,$3,$4,$5,$6,$7)",
          [newBook, author_id, date_read, rate, book_notes, coverUrl, book_summary]);
    
        res.redirect("/");
      } catch (e) {
        console.log("error adding new book!");
        console.log(e);
        res.status(500).send("Internal Server Error");
      }
    });
    

    // UPDATE
    // sarching particular book
    app.get("/update", async(req,res) => {
      try{
        // Check if the user is logged in and has a username in the session
        const username = req.session.user ? req.session.user.username : null;
        res.render("./partials/update.ejs",{
          username
        });
      }
      catch(e){
        console.log("Error going to /update :",error);
      }
    })

    // displaying all books according to searchterm
    app.post('/update/search',async (req, res) => {
      const username = req.session.user ? req.session.user.username : null;
      const searchTerm = req.body.search_term.toLowerCase();
      // console.log(searchTerm);
      // Simulate searching for books based on the search term
      const matchingBooks = await db.query(
        "SELECT * FROM books WHERE LOWER(book_name) LIKE LOWER($1)",
        ['%' + searchTerm + '%']
      );
      // console.log(matchingBooks.rows);
      res.render('./partials/update.ejs', {
        matchingBooks: matchingBooks.rows,
        username
      });

    });

    // displaying details of particular book
    app.get("/update/:id",async(req,res)=>{
      try{
        const username = req.session.user ? req.session.user.username : null;
        books = await findAll();

         // Find the book with the specified ID
        const bookId = parseInt(req.params.id);
        const selectedBook = books.find(book => book.id === bookId);

        const result = await db.query("Select author_name from authors where id = $1",[selectedBook.author_id]);
    
        res.render("./partials/update.ejs",{
          selectedBook : selectedBook,
          author_name : result.rows[0].author_name,
          username
        });
      }
      catch(e){
        console.log("Error fetching details of book !",error);
      }
    })

    // updating details of book and storing to database
    app.post("/update", async(req,res) => {
      try{
        // const { newBook, date_read, about_book, book_summary, author } = req.body;
        // const rate = parseInt(req.body.rate);
        // const book_id = parseInt(req.body.book_id);

        // console.log(book_id);

        // const books = await getBooks(newBook);
        // console.log('Books:\n', books);
        
        // // Construct the relative path from the project's root
        // const relativePath = join( 'assets', 'images', 'defaultBookCover.jpeg');
        // let coverUrl = relativePath.replace(/\\/g, '/');

        // if (books.length > 0) {
        //     // Check if there is a similar match in book name and author name
        //     // using stringSimilarity node module for pattern matching of input string(book_name) with the returned data
        //     const matches = stringSimilarity.findBestMatch(newBook, books.map(book => book.title));
        //     console.log("matches: ",matches);
        //     const bestMatch = matches.bestMatch;
        //     console.log("bestMatch: ",bestMatch);
        //     if (bestMatch.rating > 0.6) {
        //         const matchedBook = books.find(book => book.title === bestMatch.target);
        //         if (matchedBook && matchedBook.coverUrl) {
        //             coverUrl = matchedBook.coverUrl;
        //         }
        //     }
        // }
        const { newBook, date_read, about_book, book_summary, author } = req.body;
        const rate = parseInt(req.body.rate);
        const book_id = parseInt(req.body.book_id);

        console.log(book_id);
    
        const books = await getBooks(newBook);
        console.log('Books:\n', books);
    
        const relativePath = join('assets', 'images', 'defaultBookCover.jpeg');
        let coverUrl = relativePath.replace(/\\/g, '/');
    
        if (books.length > 0) {
          // Check if there is a similar match in both book name and author name
          let bestMatch = null;
          let bestMatchRating = -1;

          const titleMatches = stringSimilarity.findBestMatch(newBook, books.map(book => book.title)).ratings;
          const authorMatches = stringSimilarity.findBestMatch(author, books.map(book => book.author)).ratings;
          console.log("titleMatches: ",titleMatches);
          console.log("authorMatches: ",authorMatches);
          for(var i=0;i<titleMatches.length;i++){
            const combinedAvgRating = (titleMatches[i].rating + authorMatches[i].rating) / 2;

            if (combinedAvgRating > 0.5 && combinedAvgRating > bestMatchRating) {
              bestMatch = books[i];
              bestMatchRating = combinedAvgRating;
            }
          }
        
          console.log(bestMatch);
          if (bestMatch ) {
            //const matchedBook = books.find(book => book.title === bestTitleMatch.target && book.author === bestAuthorMatch.target);
            const matchedBook =bestMatch;
            let isCoverAvailable = false;
            console.log("matchedBook : ", matchedBook);

            if (matchedBook && matchedBook.coverUrl ) {
              for(const oclcValue of matchedBook.oclc){
                const oclcCoverUrl = `http://covers.openlibrary.org/b/oclc/${oclcValue}-M.jpg?default=false`;
                isCoverAvailable = await checkIfOpenLibraryCoverExists(oclcCoverUrl)
                if(isCoverAvailable){
                  coverUrl = oclcCoverUrl;
                  break;
                }
              }
              console.log("matchedBook.coverUrl : ", coverUrl);
            } 
            
            else {
              //isCoverAvailable = await checkIfOpenLibraryCoverExists(matchedBook.coverUrl);
    
                const key = 'title';
                const value = encodeURIComponent(matchedBook.title);
                const size = 'M';
                coverUrl = `https://covers.openlibrary.org/b/${key}/${value}-${size}.jpg`;
                console.log(coverUrl);
    
                isCoverAvailable = await checkIfOpenLibraryCoverExists(coverUrl);
    
                coverUrl = isCoverAvailable ? coverUrl : '/assets/images/defaultBookCover.jpeg';
              
            }
          }
        }
        console.log("selected cover - ",coverUrl);

        let author_id;
        
        const authorFetched = await db.query(
          "select id from authors where LOWER(author_name) like $1 ",['%' + author.trim().toLowerCase() + '%']
        );

        if(authorFetched.rows.length == 1){
          author_id = parseInt(authorFetched.rows[0].id);
        }
        else{
          console.log("Unable to fetch author id for author : ",author,". Creating new author record for ",author);
          const result = await db.query(
            "insert into authors (author_name)  values($1) returning id",[author]
          );
          author_id = parseInt(result.rows[0].id);
        }


        
        // Save the book to the database (you can replace this with your database logic)
        await db.query(
          "UPDATE books SET book_name = $1, author_id = $2, date_read = $3, rating = $4, book_summary = $5, book_cover = $6, about_book = $7 WHERE id = $8",
          [newBook, author_id, date_read, rate, book_summary, coverUrl, about_book, book_id]
        );
        
        res.redirect("/profile");
      }
      catch(e){
        console.log(e);
      }
    })


    app.get("/remove", async(req,res) => {
      try{
        // Check if the user is logged in and has a username in the session
        const username = req.session.user ? req.session.user.username : null;
        res.render("./partials/remove.ejs",{
          username
        });
      }
      catch(e){
        console.log("Error going to /remove :",error);
      }
    })

    // displaying all books according to searchterm
    app.post('/remove/search',async (req, res) => {
      const username = req.session.user ? req.session.user.username : null;
      const searchTerm = req.body.search_term.toLowerCase();
      // console.log(searchTerm);
      // Simulate searching for books based on the search term
      const matchingBooks = await db.query(
        "SELECT * FROM books WHERE LOWER(book_name) LIKE LOWER($1)",
        ['%' + searchTerm + '%']
      );
    // console.log(matchingBooks.rows);
      res.render('./partials/remove.ejs', {
        matchingBooks: matchingBooks.rows,
        username
      });

    });

    app.post("/remove", async(req,res) => {
      try{
        const removed_book = await db.query(
          "Delete from books where id = $1 returning book_name",[req.body.book_id]
        )
        console.log("Removed book ",removed_book.rows[0].book_name," successfully!");
        // alert('Book ',removed_book,' removed successfully!');
        res.redirect("/profile");
      }
      catch(e){
        console.log("Error removing the book: ",e);
        res.redirect("/profile");
      }
    })


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });