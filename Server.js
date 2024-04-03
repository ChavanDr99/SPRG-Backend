const express = require('express');
const sql = require('mssql');
require('dotenv').config();
 const app = express();
const bcrypt =require('bcryptjs');
 app.use(express.json()); app.use(express.urlencoded({extended:true}));
 const cors = require('cors');
 app.use(cors({
  origin:["https://siemens-report-generator.netlify.app/"],
    methods:["Post","Get"],
 }));
 const defaultConfig = {
  user: process.env.DB_USER ,
  password: process.env.DB_PASSWORD ,
  server: process.env.DB_SERVER ,
  driver: process.env.DB_DRIVER ,
  database: process.env.DB_DATABASE ,
  options: {
    encrypt: false,
    requestTimeout: 300000 ,
  }
};

app.use(express.json());

// API endpoint to handle database selection
app.post('/select-database', async (req, res) => {
  const { selectedDatabase } = req.body;

  if (!selectedDatabase) {
    return res.status(400).json({ success: false, error: 'Database name is required' });
  }

  try {
    // Create a copy of the default configuration
    let config = { ...defaultConfig };

    // Update the database name in the configuration based on the selected database
    config.database = selectedDatabase;

    // Establish connection using the updated configuration
    const pool = await new sql.ConnectionPool(config).connect();
    res.json({ success: true, message: `Connected to ${selectedDatabase}` });
  } catch (error) {
    console.error('Error connecting to database:', error);
    res.status(500).json({ success: false, error: 'Failed to connect to the database' });
  }
});

async function connectAndExecuteQuery() {
  try {
    await sql.connect(defaultConfig);
    console.log("DB is connected");
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

connectAndExecuteQuery();


app.post('/handle-dates', async (req, res) => {
  const { startDate, endDate } = req.body;
  // If startDate and endDate are provided, add WHERE clause to filter by date range
  

  // Here you can handle the start and end dates as needed, such as formatting or validation
  // For demonstration, we'll simply return the received dates

  res.json({ success: true, startDate, endDate });
});

// API endpoint to execute reports
app.post('/execute-report', async (req, res) => {
  const { reportName, startDate, endDate } = req.body;
  let query = '';
  let start=startDate;
  let end=endDate;
  if (startDate && endDate) {
    // Call the API to handle start and end dates
    const dateResponse = await handleDates(startDate, endDate);
    if (!dateResponse.success) {
      return res.status(400).json({ success: false, error: 'Failed to handle dates' });
    }
  }
  switch (reportName) {
    
    case 'DefectReport':
      query = `
      IF OBJECT_ID(N'tempdb..#TempDefectConfig') IS NOT NULL BEGIN DROP TABLE #TempDefectConfig END;
      IF OBJECT_ID(N'tempdb..#TempDefectConfigData') IS NOT NULL BEGIN DROP TABLE #TempDefectConfigData END;

      SELECT  DCT.Station_Id,
              S.Station_Name,
              DT.Defect_Name,
              DT.Defect_Code
      INTO #TempDefectConfig
      FROM  DefectConfigTable DCT
      INNER JOIN DefectCodeTable DT ON DCT.Defect_Id = DT.Defect_Id
      INNER JOIN Station_Info S ON DCT.Station_Id = S.Station_Id
      INNER JOIN Stations_Seqence SS ON S.Station_Id=SS.Station_Id
      WHERE SS.Line_Id=3;

      SELECT DISTINCT t.Station_Id,
                      t.Station_Name,
                      STUFF((SELECT DISTINCT '/ ' + REPLACE(t1.Defect_Name, CHAR(13) + CHAR(10), ' ')
                             FROM #TempDefectConfig t1
                             WHERE t.Station_Id = t1.Station_Id AND t.Defect_Code = t1.Defect_Code
                                FOR XML PATH(''), TYPE
                                ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') Defect_Name,
                      STUFF((SELECT DISTINCT '/ ' + t1.Defect_Code
                             FROM #TempDefectConfig t1
                             WHERE t.Station_Id = t1.Station_Id AND t.Defect_Code = t1.Defect_Code
                                FOR XML PATH(''), TYPE
                                ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') Defect_code
      INTO #TempDefectConfigData FROM #TempDefectConfig t;

      SELECT DT.[SerialNo],
             DT.[Station_Id],
             S.Station_Name,
             DT.[Defect_Id]  AS Defect_Code,
             (SELECT REPLACE(T.Defect_Name, CHAR(13) + CHAR(10), ' ') FROM #TempDefectConfigData T WHERE T.Station_Id=DT.Station_Id AND T.Defect_code=DT.Defect_Id) AS Defect_Name,
             DT.[User_Id],
             DT.[Created_Date]
      FROM [dbo].[DefectLogTable] DT
      INNER JOIN Station_Info S ON DT.Station_Id=S.Station_Id
      INNER JOIN Stations_Seqence SS ON DT.Station_Id=SS.Station_Id 
      WHERE CAST(DT.Created_Date AS DATE) >= '${start}' AND  CAST(DT.Created_Date AS DATE) <= '${end}'
      AND SS.Line_Id=3

      UNION ALL

      SELECT DT.[SerialNo],
             DT.[Station_Id],
             S.Station_Name,
             DT.[Defect_Id]  AS Defect_Code,
             (SELECT REPLACE(T.Defect_Name, CHAR(13) + CHAR(10), ' ') FROM #TempDefectConfigData T WHERE T.Station_Id=DT.Station_Id AND T.Defect_code=DT.Defect_Id) AS Defect_Name,
             DT.[User_Id],
             DT.[Created_Date]
      FROM [dbo].[DefectLogTable_Log] DT
      INNER JOIN Station_Info S ON DT.Station_Id=S.Station_Id
      INNER JOIN Stations_Seqence SS ON DT.Station_Id=SS.Station_Id 
      WHERE CAST(DT.Created_Date AS DATE) >= '${start}' AND  CAST(DT.Created_Date AS DATE) <= '${end}'
      AND SS.Line_Id=3;
    `;
      break;
      case 'QualityReport':
        query = `
        SELECT
        
                li.[Line_Name]
        
              ,si.[Station_Name]
        
              ,mi.[Model_Name]
        
        
              ,[Batch_Id]
        
              ,[User_Id]
        
              ,[LogDate]
        
              ,[Shift_Id]
        
              ,[Pass_Count]
        
              ,[Fail_Count]
        
        
          FROM [Digital_Factory].[dbo].[StationResult_ShiftCount] sc
        
        
        
          left join [dbo].[Station_Info] si on sc.Station_Id = si.Station_Id
        
          left join [dbo].[Line_Info] li on sc.Line_Id = li.Line_Id
        
          left join [dbo].[Model_Info] mi on sc.Model_Id = mi.Model_Id
        
        
          where LogDate >= '${start}' and LogDate <= '${end}' and sc.Line_Id = 3 and sc.Station_Id in (25,26,33,34,36,39,42,46,47)
        
          order by LogDate Desc
        `;
      break;
      case 'Siemens_SPM':
        query = 'SELECT * FROM [Siemens_SPM].[dbo].[Users]';
      break;
    // Add more cases for other reports if needed
    default:
      res.status(400).json({ success: false, error: 'Invalid report name' });
      return;
  }
  

  try {
    
    const pool = await sql.connect(defaultConfig);
    const result = await pool.request().query(query);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error executing report:', error);
    res.status(500).json({ success: false, error: 'Failed to execute report' });
  }
});
async function handleDates(startDate, endDate) {
  try {


    return { success: true, startDate, endDate };
  } catch (error) {
    console.error('Error handling dates:', error);
    return { success: false, error: 'Failed to handle dates' };
  }
}

app.post('/register', async (req, res) => {
  const { email, password, dbServer, dbUsername, dbPassword } = req.body;

  try {
    // Create a copy of the default configuration
    let config1 = { ...defaultConfig };

    // Update the database configuration based on the received data
    config1.server = dbServer;
    config1.user = dbUsername;
    config1.password = dbPassword;

    // Establish connection using the updated configuration
    const pool = await new sql.ConnectionPool(config1).connect();
    console.log("DB connection successful");

    // Proceed with user registration
    const checkExistingUserQuery = 'SELECT * FROM [Siemens_SPM].[dbo].[Users] WHERE Email = @email';
    const request = new sql.Request();
    request.input('email', sql.VarChar, email);
    const results = await request.query(checkExistingUserQuery);

    if (results.recordset.length > 0) {
      return res.status(201).json({ message: 'Already registered, please login' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insertUserQuery = 'INSERT INTO [Siemens_SPM].[dbo].[Users] (Email, Password) VALUES (@email, @password)';
    const insertRequest = new sql.Request();
    insertRequest.input('email', sql.VarChar, email);
    insertRequest.input('password', sql.VarChar, hashedPassword);
    await insertRequest.query(insertUserQuery);

    // Send success response
    res.status(200).json({ success: true, message: "You are registered successfully" });
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

app.post('/report',async(req,res)=>{

})

// Inside your Express app setup
app.post('/get-report-names', async (req, res) => {
  const { selectedDatabase } = req.body;

  if (!selectedDatabase) {
    return res.status(400).json({ success: false, error: 'Database name is required' });
  }

  try {
    // You can implement logic here to fetch available report names based on the selected database
    // For demonstration, we'll return hardcoded report names

    let reportNames = [];
    switch (selectedDatabase) {
      case 'Digital_Factory':
        reportNames = ['DefectReport', 'QualityReport'];
        break;
      case 'Siemens_SPM':
        reportNames = ['Siemens_SPM'];
        break;
      // Add cases for other databases if needed
      default:
        reportNames = [];
    }

    res.json({ success: true, reportNames });
  } catch (error) {
    console.error('Error fetching report names:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch report names' });
  }
});

app.post('/login', async (req, res) => {
  const userEmail = req.body.email; 
  console.log('Email received:', userEmail);

  const sqlQuery = 'SELECT * FROM [Siemens_SPM].[dbo].[Users] WHERE Email = @email';

  try {
    const request = new sql.Request();
    request.input('email', sql.VarChar, userEmail);
    const result = await request.query(sqlQuery);

    if (result.recordset.length > 0) {
      bcrypt.compare(req.body.password.toString(), result.recordset[0].Password, (err, response) => {
        if (err) {
          console.error('Bcrypt comparison error:', err);
          return res.status(500).json({ error: 'Password comparison error' });
        }
        if (response) {
          return res.status(200).json({ success: true, message: " login success",userEmail });
        } else {
          return res.json({ status: "Password does not match" });
        }
      });
    } else {
      console.log('User not found for email:', userEmail);
      return res.status(404).json({ success:false,error: 'User not found' });
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: 'Login error' });
  }

});


app.listen(8081,(req,res)=>{
  console.log("server is running on port 8081")
})
          

