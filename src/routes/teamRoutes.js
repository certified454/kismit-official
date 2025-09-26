import mongoose from "mongoose";
import express, { request } from "express";
import team from "../modules/team.js";
import Player from "../modules/player.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

//create team route
router.post('/register', protectRoute, async (req, res) => {
    const userId = req.user._id;

    const { name, players } = req.body;
    try {
        if (!name || !players) {
            console.log('All fields are required')
            return res.status(400).json({ message: 'All fields are required' });
        }
        // create players name if they dont exist
        const playerIds = [];
        for (const playerName of players) {
            let player = await Player.findOne({ name: playerName.name, position: playerName.position });
            if (!player) {
                player = new Player({ name: playerName.name, position: playerName.position });
                await player.save();
            } else {
                playerIds.push(player._id);
                await player.save();
            }
            playerIds.push(player._id);
        };
        
        if (players.length !== 7) {
            console.log('You must add exactly seven players to make a team');
            return res.status(400).json({ message: 'You must add exactly seven players to make a team' });
        }
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

//get a user's teams
router.get('/:teamId', protectRoute, async (req, res) => {
    const teamId = req.params.teamId;
    try {
        const userTeam = await team.findById(teamId)
        .populate('players', 'name position');

        if (!userTeam) {
            console.log('Team not found');
            return res.status(404).json({ message: 'Team not found' });
        };
        res.send({ userTeam, message: 'Team found' });
    } catch (error) {
        console.log('internal server error');
        res.status(500).json({message: 'internal server error', error: error.message});
    }
})

export default router;