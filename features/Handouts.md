# Description
I want to implement handouts feature in application. 
It should be located in Options panel as a separate tab called "Handouts". There is already file HandoutsTab.jsx.
GameMaster (GM) should be able to create handouts, upload files/images for them, set their visibility (visible to all players, chosen ones or only to GM) and delete them.
Players should be able to see only handouts that are visible to them.
Handouts should be opened in a modal window when clicked from the list.
Save handouts data in the backend in the game document under `handouts` field. Handout will be assigned to game. 

Use following structure for each handout:
```json
{
    "id": "unique-handout-id",
    "title": "Handout Title",
    "description": "Brief description of the handout",
    "type": "image/pdf/text/other", // propose different types and assign icon to visualize each of them
    "visibility": ["player1-id", "player2-id"], // array of player IDs who can see the handout, or ["gm-only"] for GM only
    "fileUrl": "url-to-uploaded-file"
}
```

Use similar visual design as in other parts of the application, following existing styles and themes.
Add also posibility to reorder handouts in the list by drag and drop (GM only). Players see handouts in the order defined by GM.

# Fields
    - Title
    - Description
    - Type - propose diffrent types and assign icon to visualize each of them 
    - Visibility settings (multi dropdown with all players listed - possible to choose "all players" or "only me (GM)")
    - File upload
