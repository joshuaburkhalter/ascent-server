import Helios from '2n-helios-client';
import { createClient } from '@supabase/supabase-js'
import { generatePin } from './helpers.js'
import * as schedule from 'node-schedule'

const helios = new Helios({
        ip: '10.1.10.123',
        user: 'admin',
        pass: 'A1aska77'
})

const send = (payload) => {
    acm.send({type: 'broadcast', event: 'acm', payload})
}

async function open() {
    const res = await helios.switch('open')
    if (res) {
        acm.send({type: 'broadcast', event: 'acm', 'payload': {type: 'lock', res: 'opened'}})
    }
}

async function lock() {
    const res = await helios.switch('lock');
    console.log(res)
}

async function unlock() {
    const res = await helios.switch('unlock');
    console.log(res)
}

async function checkUser(m) {
    const userEnrolled = await helios.getUser(m.id)
    if (userEnrolled.errors) {
        const success = await helios.addUser(m.name, m.email, {pin: generatePin(), fpt: []}, m.id)
        return success
    } else {
        return true
    }
}

async function updatePin(m) {
    const success = await checkUser(m)
    if (success) {
        helios.updateUserAccess(m.id, {pin: m.pin}).then((updated)=> {
            if (updated) {
                send({type: 'pin', res: {pin: m.pin}})
            } else {
                send({type: 'pin', res: 'error'})
            }
        })
    } else {
        console.log('Error in user check.')
        send({type: 'pin', res: 'error'})
    }
}

async function updatePrint(m) {
    let printNumber
    switch (m.print) {
        case 'index': printNumber = 6 
            break;
        case 'middle': printNumber = 7
            break;
        case 'thumb': printNumber = 5
    }
    if (m.delete) {
        const deleted = await helios.removeBio(m.id, printNumber)
        if (deleted) {
            send({type: 'print', res: {state: 'deleted', print: m.print}})
        }
    } else {
        const success = checkUser(m)
        if (success) {
            helios.enrollBio(m.id, printNumber, 2, (progress)=> {
                if (progress === 1) {
                    send({type: 'print', res: {state: 'first'}})
                } else if (progress === 2) {
                    send({type: 'print', res: {state: 'second'}})
                } else if (progress === 3) {
                    send({type: 'print', res: {state: 'third'}})
                } else if (progress === 4) {
                    send({type: 'print', res: {state: 'complete', prints: m.prints ? [...m.prints, m.print] : m.print}})
                } else if (progress === 5) {
                    send({type: 'print', res: {state: 'error'}})
                }
            })
        } else {
            console.log('Error in user check.')
            send({type: 'print', res: {state: 'error'}})
        }
    }
}

async function updateAutoLock(m) {
    let time = new schedule.RecurrenceRule()
    time = {hour: m.hour, minute: m.minute}
    schedule.scheduleJob(time, ()=> {
        lock()
        send({type: 'lock', res: 'locked'})
    })
}

const supabaseUrl = 'https://txivwratmswnelujiots.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4aXZ3cmF0bXN3bmVsdWppb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTM5MzkzNDAsImV4cCI6MjAwOTUxNTM0MH0.9vGp7qye01l89wIvRPpVBsatC2lhVNldfU_UJ8Jd9hQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
const acm = supabase.channel('acm')

async function messageRX(d) {
    const msg = d.payload
    console.log(msg)
    if (msg.type === 'lock') {
        switch (msg.command) {
            case 'open':
                open();
                break;
            case 'lock':
                lock();
                break;
            case 'unlock':
                unlock();
        }
    }
    if (msg.type === 'pin') {
        updatePin(msg);
    }
    if (msg.type === 'print') {
        updatePrint(msg)
    }
    if (msg.type === 'auto-lock') {
        updateAutoLock(msg)
    }
}

acm.on('broadcast', {event: 'acm'}, (d) => messageRX(d)).subscribe((status) => {
    if (status !== 'SUBSCRIBED') {
        return null
    }
})





