A.> High level info 

This is related to creating Cerner Practioner app
You application should be able to do the following with a Web Application and the Cerner SMART on FHIR Sandbox:

A.1> Basic problem statment ( this is must have)
Initiate the launch automatically when opened
Display a Patient Banner (or not) depending on what the EHR instructs via token context.
List all of the current patient’s vital signs.
Allow the user to create new vital sign entries.

Above is just a high level requiremnt , you are free to innovative in your application creation and I want you to help me in that 

This will SMART EHR Launch Flow as mentioned at below url
https://build.fhir.org/ig/HL7/smart-app-launch/app-launch.html#launch-app-ehr-launch

B> Some Technical information 
Below are urls needed

 "authorization_endpoint": "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/personas/provider/authorize"
    "token_endpoint": "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token"

    base url : https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d
    client id : 66037bbc-cc54-405b-b3fd-5fbeaeac4251

    In postman I gave auth url with two addional parameters

    https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/personas/provider/authorize?aud=https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d&launch=83e7caf4-fff7-42d3-a0c4-e4da835f4f2c
    grant type : authorization code with PKCE

    callback url : http://127.0.0.1:5173

    I have used FHIR v2 while registering the app on cerner but on meta shows only V1 urls , please check will this create any problem
    Below are the application details

    Application Name
FHIR Boot Camp
Application Owner :parag m
Application ID :b4ae40b3-e888-4821-87f8-0586abb29cef
Client ID :66037bbc-cc54-405b-b3fd-5fbeaeac4251
Application Type:Provider
Type of Access :Offline
Application Privacy:Public
SMART Version:SMART v2
Intended Users:Individual/Caregiver, Clinical Team
Intended Purposes:Clinical Tools

for the time being i have created scope for only observation based on the plan i can add more scope in appliction.

C> Technology Stack 
Typescript, React , C# ( if needed), tailwind CSS (You are freed to suggest better but managable ), vite 
UI expections : 
1> No screen should use any type of scroobars , screen should accomodate /use real estate for one page and design the things accordingly
2> keep consistency for colors , fonts 
3> I may add section c in Agent.md or skills.md if you suggest so 

D> What I expect in the plan 
We are creating SMART on FHIR EHR launch app for Practioner below are my thoughts.
1> Cerner or for that matter any EHR vendor give practioner general features for their regular use .If I am a SMARt on FHIR developer I should give something which these vendors not able to give then only Practioner will atleast think about my app .
2> I want you think deeply about the use cases and do some research and submit the ideas.
3> You can think about CDS hooks or some other kind of features that could be helpful which EHRs do not offer ( this is just an example)
4> Think about using AI considering HIPAA .

I expect to work on point D and comeup with a document with all the use cases you can think of and which should be practicle and implementable in sandbox enviorment and carried forward whenever needed in production .
Once we finalize the use case you can work on the detiail plan and once plan is reviewed and acceepted by me we work on actual implemenation .

Lastly Feel free to give any suggestions regarding various points discussed above in this document . Feel free to ask any queries . Dont create anything without my permission. 

dont push anything to github without asking .



