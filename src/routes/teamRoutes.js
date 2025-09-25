import mongoose from "mongoose";
import express, { request } from "express";
import team from "../modules/team.js";
import Player from "../modules/player.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

//create team route
router.post('/register', protectRoute, async (req, res) => {
    const userId = req.user._id;

    const { name, owner, players } = req.body;
    if (owner !== userId.toString()) {
        return res.status(403).json({ message: 'You can only create a team for yourself' });
    };
    try {
        const existingPlayers = await Player.find({ name: { $in: players }, owner: userId });
        if (existingPlayers.length > 0) {
            return res.status(400).json({ message: 'You already have players with these names' });
        }
        if (players.length !== 7) {
            console.log('You must add exactly seven players to make a team');
            return res.status(400).json({ message: 'You must add exactly seven players to make a team' });
        }
        const playerIds = [];
        for (const playerName of players) {
            const newPlayer = new Player({
                name: playerName,
                owner: userId
            });
            await newPlayer.save();
            playerIds.push(newPlayer._id);
        };
        const newTeam = new team({
            name,
            owner: userId,
            players: playerIds
        });
        await newTeam.save();
        res.status(201).json({ message: 'Team created successfully', team: newTeam
        })
    } catch (error) {
        console.log('internal server error');
        res.status(500).json({message: 'internal server error', error: error.message})
    }
})

export default router;